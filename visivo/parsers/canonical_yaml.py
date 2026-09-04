"""Canonical YAML formatting for project files (VIS-1196).

Once the cloud writes YAML into a customer's repo, every write risks reordering
keys or re-quoting scalars and producing a diff that buries the one real change.
A canonical style makes a commit's diff exactly the semantic change.

**Key order comes from the Pydantic models, not a hand-maintained list.** The
order a type declares its fields in is already the order a person would write
them, and deriving it means the formatter cannot drift from the schema: add a
field to a model and it lands in the right place here for free.

Formatting is done with the same ``ruamel.yaml.YAML(typ="rt")`` round-trip
instance ``ProjectWriter`` uses, so **comments survive**. Plain ``yaml.dump``
would destroy them, which is why the new-project writers in
``server/views/utils.py`` are not a model to follow here.
"""

import typing
from typing import Annotated

import ruamel.yaml
from ruamel.yaml.comments import CommentedMap
from ruamel.yaml.scalarstring import LiteralScalarString

# Set on every object by the parser, never authored by a person. They are
# dropped from the canonical order so they sort after anything real rather than
# ahead of `name`.
INTERNAL_KEYS = ("path", "file_path")

# Project-level keys tooling writes rather than people: they belong after the
# authored content, not between `name` and `includes` where the model happens
# to declare them.
MACHINE_KEYS = ("project_file_path", "project_dir", "cli_version")

# `name` is the object's identity and `type` is its discriminator, so both lead
# regardless of where a model happens to declare them — SqliteSource puts `type`
# tenth, which is an artifact of inheritance rather than an authoring order.
LEADING_KEYS = ("name", "type")

_MAX_DEPTH = 12


def _variant_classes(annotation, found=None, depth=0):
    """Every Pydantic class reachable from a Project field's annotation.

    A project key is rarely one class: ``sources`` is ten, ``dashboards`` two.
    The annotations are wrapped by ``generate_ref_field`` in ``NewType`` and
    ``Annotated`` layers, both of which have to be unwrapped before the
    ``model_fields`` check — ``Annotated`` forwards attribute access, so it
    answers to ``model_fields`` while not being a model.
    """
    found = found if found is not None else []
    if annotation is None or depth > _MAX_DEPTH:
        return found

    supertype = getattr(annotation, "__supertype__", None)
    if supertype is not None:
        return _variant_classes(supertype, found, depth + 1)

    if typing.get_origin(annotation) is Annotated:
        return _variant_classes(typing.get_args(annotation)[0], found, depth + 1)

    if isinstance(annotation, type) and hasattr(annotation, "model_fields"):
        if annotation not in found:
            found.append(annotation)
        return found

    for argument in typing.get_args(annotation):
        _variant_classes(argument, found, depth + 1)
    return found


def _merged_field_order(classes):
    """One order covering every variant, first declaration wins."""
    order = []
    for cls in classes:
        for field in cls.model_fields:
            if field not in order and field not in INTERNAL_KEYS:
                order.append(field)
    leading = [key for key in LEADING_KEYS if key in order]
    return leading + [key for key in order if key not in leading]


def key_order_for_project_key(project_key):
    """Canonical key order for the objects under a top-level project key."""
    from visivo.models.project import Project

    field = Project.model_fields.get(project_key)
    if field is None:
        return []
    return _merged_field_order(_variant_classes(field.annotation))


def project_key_order():
    """Canonical order of the top-level keys of a project file."""
    from visivo.models.project import Project

    skip = INTERNAL_KEYS + MACHINE_KEYS
    return [key for key in Project.model_fields if key not in skip]


def _reorder(mapping, order):
    """Reorder a CommentedMap in place to ``order``, unknown keys last.

    ``move_to_end`` is what keeps the comments: ruamel keys comment attributes
    by key name, so moving a key carries its comment with it. Rebuilding the
    map instead would strip them.
    """
    if not isinstance(mapping, CommentedMap):
        return
    present = [key for key in order if key in mapping]
    remaining = [key for key in mapping if key not in present]
    for key in present + remaining:
        mapping.move_to_end(key)


def _blockify(mapping):
    """Multi-line strings become ``|`` blocks rather than escaped one-liners."""
    if isinstance(mapping, CommentedMap):
        for key, value in mapping.items():
            if (
                isinstance(value, str)
                and "\n" in value
                and not isinstance(value, LiteralScalarString)
            ):
                mapping[key] = LiteralScalarString(value)
            else:
                _blockify(value)
    elif isinstance(mapping, list):
        for item in mapping:
            _blockify(item)


def canonicalize(data):
    """Apply the canonical style to a parsed project document, in place.

    List ORDER is never touched. Some lists are semantic — dashboard rows and
    their items render in the order they appear — and there is no way to tell
    those from the incidental ones without knowing the type, so none are sorted.
    """
    if not isinstance(data, CommentedMap):
        return data

    _reorder(data, project_key_order())

    for project_key, value in data.items():
        if not isinstance(value, list):
            continue
        order = key_order_for_project_key(project_key)
        if not order:
            continue
        for item in value:
            _reorder(item, order)

    _blockify(data)
    return data


def _yaml():
    """The round-trip instance, configured exactly as ``ProjectWriter``'s.

    Same settings on purpose: a file this formats and a file ProjectWriter
    edits have to come out the same, or a cloud edit reformats the whole file
    and the diff stops being the change.
    """
    yaml = ruamel.yaml.YAML(typ="rt")
    yaml.indent(mapping=2, sequence=4, offset=2)
    yaml.preserve_quotes = True
    yaml.width = float("inf")
    return yaml


def format_text(text):
    """Canonical form of a YAML document's text."""
    import io

    yaml = _yaml()
    data = yaml.load(text)
    if data is None:
        return text
    canonicalize(data)
    stream = io.StringIO()
    yaml.dump(data, stream)
    return stream.getvalue()


def format_file(path, write=True):
    """Format ``path``. Returns True when the file was not already canonical."""
    with open(path, "r") as handle:
        original = handle.read()

    formatted = format_text(original)
    changed = formatted != original
    if changed and write:
        with open(path, "w") as handle:
            handle.write(formatted)
    return changed
