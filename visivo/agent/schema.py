"""Per-type schema slices, so an agent can author without the whole vocabulary.

The full project schema is **3.2 MB** and cannot go in a context window. Almost
all of it is Plotly: ``Layout`` alone is 414 KB, and the trace defs are 80–95 KB
each. The types an agent actually authors are 2–8 KB.

A ``$def`` on its own is not enough, though — it is full of ``$ref`` s, and
following them naively is how you get the 3.2 MB back. ``Chart``'s transitive
closure IS the whole schema, and even ``SqlModel``'s is 48 KB because a model's
``source`` field reaches every source flavour.

So refs are followed, but **stopped** at two kinds of thing:

**Another authorable type.** A model's ``source`` is a ``${ref(name)}`` to a
source that already exists, not an inline source definition — so an agent
authoring a model does not need ten source schemas, it needs to know the field
takes a reference. If it is authoring a source next, that is its own call. This
is what "pay only for what you are doing" means concretely, and it is what takes
``model`` from 48 KB to under 10.

**A Plotly blob.** ``Layout`` and the trace defs describe a rendering library,
not Visivo's vocabulary. They are replaced by a note naming the valid trace
types, which is the part an agent has to get right.

Every stopped ref leaves a ``$comment`` saying what it was and how to get it, so
the agent can follow up rather than guess at a dangling reference.
"""

import json

from visivo.parsers.schema_generator import generate_schema

# The defs each authorable type resolves to, read off the project schema rather
# than listed, so a new type or a new source flavour needs no edit here.
_TYPE_KEYS = (
    "sources",
    "models",
    "metrics",
    "dimensions",
    "relations",
    "insights",
    "charts",
    "tables",
    "markdowns",
    "inputs",
    "dashboards",
)

# Plotly, not Visivo. Recognised by where they live in the schema rather than by
# name: these are the defs the trace/layout props point at.
_PLOTLY_HINT = ("Layout", "props")


def _walk_refs(node, found):
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "$ref" and isinstance(value, str) and value.startswith("#/$defs/"):
                found.add(value.rsplit("/", 1)[-1])
            else:
                _walk_refs(value, found)
    elif isinstance(node, list):
        for item in node:
            _walk_refs(item, found)


def _project_schema():
    schema = generate_schema()
    return json.loads(schema) if isinstance(schema, str) else schema


def _defs_for_type(schema):
    """``{type_key: {def names}}`` — which defs each top-level list accepts."""
    mapping = {}
    for key in _TYPE_KEYS:
        found = set()
        _walk_refs(schema.get("properties", {}).get(key, {}), found)
        mapping[key] = found
    return mapping


class SchemaSlicer:
    """Slices one project schema. Built once; ``for_type`` is cheap after that."""

    def __init__(self, schema=None):
        self.schema = schema or _project_schema()
        self.defs = self.schema.get("$defs", {})
        self.by_type = _defs_for_type(self.schema)
        # Every def that IS an authorable type, so a ref to one can be stopped.
        self.authorable = {name for names in self.by_type.values() for name in names}
        self.type_of = {name: key for key, names in self.by_type.items() for name in names}

    def type_keys(self):
        return sorted(self.by_type)

    def for_type(self, type_key):
        """A self-contained slice for one type: its defs plus the helpers they
        need, with references to other types and to Plotly left as pointers."""
        if type_key not in self.by_type:
            raise KeyError(type_key)

        roots = self.by_type[type_key]
        kept = {}
        pending = list(roots)
        while pending:
            name = pending.pop()
            if name in kept or name not in self.defs:
                continue
            kept[name] = self._prune(self.defs[name], stop_at=self.authorable - roots)
            found = set()
            _walk_refs(kept[name], found)
            pending.extend(found - set(kept))

        return {
            "type": type_key,
            "$defs": kept,
            "accepts": sorted(roots),
            "notes": self._notes(type_key, roots),
        }

    def _prune(self, node, stop_at):
        """A def with refs to other authorable types and to Plotly replaced by a
        note. Recursive, because the refs are nested in field definitions."""
        if isinstance(node, dict):
            ref = node.get("$ref")
            if isinstance(ref, str) and ref.startswith("#/$defs/"):
                target = ref.rsplit("/", 1)[-1]
                if target in stop_at:
                    return self._pointer(target)
                if self._is_plotly(target):
                    return self._plotly_pointer(target)
            return {key: self._prune(value, stop_at) for key, value in node.items()}
        if isinstance(node, list):
            return [self._prune(item, stop_at) for item in node]
        return node

    def _is_plotly(self, name):
        if name == "Layout":
            return True
        # A trace def is one only the props of a chart/insight reach, and they
        # are the large ones. Size is the honest signal: Visivo's own types are
        # single-digit KB and Plotly's are tens.
        return len(json.dumps(self.defs.get(name, {}))) > 20_000

    def _pointer(self, target):
        type_key = self.type_of.get(target, target)
        return {
            "type": "string",
            "$comment": (
                f"A reference to an existing {target}, written as "
                f"${{ref(name)}}. Call get_schema('{type_key}') for its shape, "
                f"or list_{type_key} to see what exists."
            ),
        }

    def _plotly_pointer(self, target):
        return {
            "type": "object",
            "$comment": (
                f"Plotly's {target} schema, omitted — it is hundreds of "
                "kilobytes and describes a rendering library rather than "
                "Visivo's vocabulary. Author the fields you need and call "
                "validate_<type> to check them."
            ),
        }

    def _notes(self, type_key, roots):
        notes = [
            "References to other objects are strings of the form ${ref(name)}.",
            # Not every type marks `name` required in its schema, but every
            # write tool needs one — the object is stored under it. Saying so
            # here saves the agent learning it from a rejection.
            "Every config needs a 'name'; it is how the object is referenced " "and stored.",
        ]
        if len(roots) > 1:
            notes.append(
                "This type is a union: a config must match one of "
                + ", ".join(sorted(roots))
                + ", chosen by its 'type' field."
            )
        if type_key in ("charts", "insights"):
            notes.append(
                "Plotly props and layout are not included. Set the fields you "
                "need and call validate_chart / validate_insight — the error "
                "names what is wrong."
            )
        return notes
