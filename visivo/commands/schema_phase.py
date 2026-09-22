"""
Emit the Visivo project JSON Schema in a form an agent can actually consume.

The schema that ships in ``visivo/src/visivo_project_schema.json`` is ~3.3 MB
across 103 ``$defs``.  It is the right thing for the viewer (which validates
every Plotly property client side) and the wrong thing for an LLM: nobody can
put 3.3 MB in a prompt, so agents guess at Visivo's grammar instead of reading
it.  ``visivo schema`` exists to hand an agent the part of that schema that
describes *a Visivo project* -- roughly 95 KB, ~24k tokens, cacheable.

THE CORE SELECTION RULE
=======================

The subset is *derived*, not hand-maintained.  Seven mechanical steps, each of
which can be re-run against a future version of the models without anyone
curating a list of type names:

1. **Build from the Pydantic-native schema, not the merged one.**
   ``schema_generator.generate_project_schema()`` is the Pydantic dump of
   ``Project``; ``schema_generator.generate_schema()`` is that dump with the
   vendored Plotly JSON (``visivo/schema/*.schema.json``) merged on top.  The
   merge is the entire size problem: it adds the 48 trace-prop ``$defs`` plus
   ``Layout`` (423,983 bytes on its own) and takes the file from 115 KB to
   3.3 MB.  Choosing the un-merged function prunes all of it in one step --
   and prunes it *by construction*, so a new Plotly trace type added
   tomorrow is excluded automatically.

   Nothing dangles as a result: in the Pydantic-native schema ``Insight.props``
   is already ``InsightProps`` (``type`` required, any other key allowed) and
   ``Layout`` is already an open object.  An agent that needs the real Plotly
   vocabulary for one chart type asks for it explicitly with
   ``visivo schema --props bar``.

2. **Keep only the authoring surface at the root.**  ``CORE_PROJECT_PROPERTIES``
   below lists the ``Project`` fields a human or an agent writes by hand in
   ``project.visivo.yml``.  ``OMITTED_PROJECT_PROPERTIES`` lists the rest with
   the reason each one is out.  Every ``Project`` field must appear in exactly
   one of the two.

3. **Transitively close over ``$ref`` from those roots** and drop every
   ``$def`` nothing reaches.

4. **Delete the machine-set fields** (``MACHINE_SET_FIELDS``) from every
   object *that inherits them*.  The CLI fills these in; an agent that writes
   them is making a mistake, and they cost ~9 KB across 45 defs.  A name alone
   is not proof, though: a concrete model may redeclare one of those names as a
   field an agent has to write.  ``Include.path`` is exactly that -- it is the
   only way to write ``includes:`` at all -- so the rule asks *which class
   declared the field*, and keeps it when the answer is not one of the models
   that carry it for the CLI's benefit.

5. **Delete Pydantic's auto-generated property titles.**  ``"title": "Source
   Name"`` above a property literally named ``source_name`` is ~4 KB of
   restatement.  Titles on the ``$defs`` themselves are kept.

6. **Repair the unsatisfiable ``oneOf``s.**  Pydantic renders a union with a
   *callable* discriminator -- ``SecretStrOrEnvVar`` is
   ``Union[EnvVarString, SecretStr]``, chosen at runtime by a regex on the
   value -- as a JSON Schema ``oneOf``.  The discriminator is Python and does
   not survive the dump, so both branches come out as ``{"type": "string"}``
   (one of them wearing ``format: password``), and ``oneOf`` requires *exactly*
   one match.  Every string matches both, so the schema rejects every
   ``password:`` on every source type.  Where two branches of a ``oneOf`` are
   identical once the annotation-only keywords are set aside, they accept
   exactly the same values, the ``oneOf`` is unsatisfiable, and the keyword is
   rewritten to ``anyOf``.  Unions that really do discriminate -- the source
   type union, whose branches are distinct ``$ref``s -- are untouched.

7. **Restore the Python-keyword aliases.**  ``Test.if_`` and ``Alert.if_`` carry
   a trailing underscore because ``if`` is a reserved word in Python; the key
   people actually write in YAML -- and that every doc example shows -- is
   ``if``.  The schema is dumped with ``by_alias=False``, so any property named
   ``<keyword>_`` is emitted under the bare keyword as well, and the underscore
   spelling is marked ``deprecated`` so an agent picks the right one.  The test
   is ``name[:-1] in keyword.kwlist``, which is why this does *not* drag in the
   1.0-era ``targets``/``target`` aliases that ``by_alias=True`` would.

Caveat: the core schema is an *authoring* contract.  Because ``Project`` and
its objects are ``extra="forbid"``, stripping the machine-set fields means the
core schema rejects a document that carries them -- notably the
``project.json`` the CLI writes at compile time, and any object round-tripped
out of the server API.  Validate hand-written YAML with ``--core``; validate
compiler output with ``--full``.

The same ``extra="forbid"`` is why step 2 does not simply *drop* the omitted
root fields.  Five of the eight are machine-set and stay out for the reason
above, but ``alerts``, ``destinations`` and ``dbt`` are hand-authored and legal;
omitting them from a root that forbids unknown keys would turn "not described
here" into "not allowed here", so a real project that uses them would fail to
validate and an agent would be told the user's ``alerts:`` block is an illegal
key.  Each of the three is therefore emitted as a permissive stub carrying its
reason -- described nowhere, accepted everywhere.
"""

import json
from copy import deepcopy
from typing import Any, Dict, Iterable, List, Optional, Set

# ---------------------------------------------------------------------------
# Step 2: the authoring surface.
# ---------------------------------------------------------------------------

#: ``Project`` fields an agent writes by hand.  Order is the order they should
#: appear in a project file, which is also the order they are emitted in.
CORE_PROJECT_PROPERTIES: List[str] = [
    "name",
    "defaults",
    "includes",
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
    "tests",
]

#: ``Project`` fields deliberately left out of the core subset, each with its
#: reason.  Data, not a comment, so a guard test can assert CORE + OMITTED is
#: every field ``Project`` has.
OMITTED_PROJECT_PROPERTIES: Dict[str, str] = {
    "path": "Machine-set: the CLI assigns it while parsing.",
    "file_path": "Machine-set: the CLI records which file the object came from.",
    "project_file_path": "Machine-set: the path of the root project file.",
    "project_dir": "Machine-set: the directory of the root project file.",
    "cli_version": "Machine-set: stamped by the CLI that wrote the project.",
    "dbt": "Imports models and sources from an external dbt project rather than authoring Visivo objects.",
    "alerts": "Notification wiring that fires after `visivo test`; orthogonal to building a dashboard.",
    "destinations": "Notification targets for alerts; orthogonal to building a dashboard.",
}

#: Step 4: fields the CLI fills in, removed from every object that *inherits*
#: them. See ``_authored_machine_set_fields`` for why inheritance, and not the
#: bare name, is the test.
MACHINE_SET_FIELDS: Set[str] = {
    "path",
    "file_path",
    "project_file_path",
    "project_dir",
    "cli_version",
}

#: Where an agent goes for the vocabularies step 1 pruned.
PRUNED_VOCABULARY_NOTE = {
    "insight_props": (
        "`props` accepts any Plotly property valid for its `type`. Run "
        "`visivo schema --props <type>` (e.g. `--props bar`) for the full "
        "property schema of one chart type."
    ),
    "layout": (
        "`layout` accepts any Plotly layout property. Run "
        "`visivo schema --layout` for the full layout schema."
    ),
}


class SchemaSelectionError(Exception):
    """Raised when a caller asks for a schema slice that does not exist."""


def _ref_names(node: Any, into: Set[str]) -> None:
    """Collect every local ``$defs`` name referenced anywhere under ``node``."""
    if isinstance(node, dict):
        ref = node.get("$ref")
        if isinstance(ref, str) and ref.startswith("#/$defs/"):
            into.add(ref[len("#/$defs/") :])
        for value in node.values():
            _ref_names(value, into)
    elif isinstance(node, list):
        for value in node:
            _ref_names(value, into)


def _reachable_defs(roots: Iterable[str], defs: Dict[str, Any]) -> Set[str]:
    """Step 3: transitive ``$ref`` closure over ``defs`` starting at ``roots``."""
    seen: Set[str] = set()
    stack = list(roots)
    while stack:
        name = stack.pop()
        if name in seen or name not in defs:
            continue
        seen.add(name)
        children: Set[str] = set()
        _ref_names(defs[name], children)
        stack.extend(children - seen)
    return seen


def _machine_set_owners() -> tuple:
    """The models that declare a ``MACHINE_SET_FIELDS`` name for the CLI's use.

    ``BaseModel`` declares ``path``, ``NamedModel`` declares ``file_path``, and
    ``Project`` declares ``project_file_path``/``project_dir``/``cli_version``.
    A field inherited from one of these is bookkeeping; a field declared
    anywhere else happens to share the name and is the agent's to write.
    """
    from visivo.models.base.base_model import BaseModel
    from visivo.models.base.named_model import NamedModel
    from visivo.models.project import Project

    return (BaseModel, NamedModel, Project)


def _model_classes() -> Dict[str, Any]:
    """``{class name: class}`` for every model reachable from ``BaseModel``.

    A name shared by two classes maps to ``None``: a ``$defs`` key cannot be
    traced back to one class, so the caller declines to strip anything for it.
    """
    from visivo.models.base.base_model import BaseModel

    _machine_set_owners()  # imports Project, and with it the whole model tree.

    found: Dict[str, Any] = {}
    seen: Set[Any] = set()
    stack: List[Any] = [BaseModel]
    while stack:
        for subclass in stack.pop().__subclasses__():
            if subclass in seen:
                continue
            seen.add(subclass)
            stack.append(subclass)
            found[subclass.__name__] = subclass if subclass.__name__ not in found else None
    return found


def _authored_machine_set_fields(model_name: str, classes: Dict[str, Any]) -> Set[str]:
    """The ``MACHINE_SET_FIELDS`` ``model_name`` declares itself, and so keeps.

    ``MACHINE_SET_FIELDS`` is a list of *names*, and a name is not proof:
    ``Include`` redeclares ``path`` as the only key an include has, so stripping
    it by name leaves a definition that rejects every ``includes:`` in the repo.
    The question asked here is *which class declared this field* -- one of the
    models in ``_machine_set_owners`` (bookkeeping, strip it) or the concrete
    model itself (authoring surface, keep it).
    """
    model = classes.get(model_name)
    if model is None:
        # Nothing to ask. Keeping a machine-set field costs a few bytes;
        # deleting an authored one costs the agent a valid document, so keep.
        return set(MACHINE_SET_FIELDS)

    owners = _machine_set_owners()
    authored = set()
    for field in MACHINE_SET_FIELDS:
        declaring = next(
            (base for base in model.__mro__ if field in vars(base).get("__annotations__", {})),
            None,
        )
        if declaring is not None and declaring not in owners:
            authored.add(field)
    return authored


def _restore_keyword_aliases(definition: Dict[str, Any]) -> None:
    """Step 7: ``if_`` also accepted (and preferred) as ``if``."""
    import keyword

    properties = definition.get("properties")
    if not isinstance(properties, dict):
        return
    for name in list(properties):
        if not name.endswith("_") or not keyword.iskeyword(name[:-1]):
            continue
        alias = name[:-1]
        if alias in properties:
            continue
        properties[alias] = deepcopy(properties[name])
        properties[name]["deprecated"] = True
        properties[name]["description"] = (
            f"Deprecated spelling of `{alias}`; write `{alias}` instead. "
            + str(properties[name].get("description") or "")
        ).strip()


#: JSON Schema keywords that annotate rather than constrain: two branches that
#: differ only in these accept exactly the same set of values.
_ANNOTATION_KEYWORDS = frozenset(
    {
        "$comment",
        "default",
        "deprecated",
        "description",
        "examples",
        "format",
        "readOnly",
        "title",
        "writeOnly",
    }
)


def _validation_shape(branch: Any) -> str:
    """``branch`` reduced to the part that decides whether a value validates."""
    if not isinstance(branch, dict):
        return json.dumps(branch, sort_keys=True)
    return json.dumps(
        {key: value for key, value in branch.items() if key not in _ANNOTATION_KEYWORDS},
        sort_keys=True,
    )


def _repair_unsatisfiable_one_ofs(node: Any) -> None:
    """Step 6: ``oneOf`` -> ``anyOf`` where the branches cannot discriminate.

    ``oneOf`` demands that *exactly* one branch match. Two branches that are
    identical apart from annotations match together or not at all, so nothing
    can satisfy the keyword.
    """
    if isinstance(node, dict):
        branches = node.get("oneOf")
        if isinstance(branches, list) and "anyOf" not in node:
            # A sibling `anyOf` would have to be intersected, not replaced; no
            # such node exists in the dump.
            shapes = [_validation_shape(branch) for branch in branches]
            if len(set(shapes)) < len(shapes):
                node["anyOf"] = node.pop("oneOf")
        for value in node.values():
            _repair_unsatisfiable_one_ofs(value)
    elif isinstance(node, list):
        for value in node:
            _repair_unsatisfiable_one_ofs(value)


def _strip_property_titles(node: Any) -> None:
    """Step 5: drop Pydantic's auto-generated titles below the ``$def`` level."""
    if isinstance(node, dict):
        node.pop("title", None)
        for value in node.values():
            _strip_property_titles(value)
    elif isinstance(node, list):
        for value in node:
            _strip_property_titles(value)


def _pydantic_project_schema() -> Dict[str, Any]:
    """Step 1: the Pydantic-native schema, before the Plotly merge."""
    from visivo.parsers.schema_generator import generate_project_schema

    return json.loads(generate_project_schema())


def full_schema() -> Dict[str, Any]:
    """The complete schema, Plotly vocabularies included (~3.3 MB)."""
    from visivo.parsers.schema_generator import generate_schema

    return json.loads(generate_schema())


def core_schema() -> Dict[str, Any]:
    """The authoring subset, derived by the seven steps in the module docstring."""
    from visivo.version import VISIVO_VERSION

    source = _pydantic_project_schema()
    source_properties = source.get("properties", {})
    defs = source.get("$defs", {})

    unknown = [
        name
        for name in source_properties
        if name not in CORE_PROJECT_PROPERTIES and name not in OMITTED_PROJECT_PROPERTIES
    ]
    if unknown:
        raise SchemaSelectionError(
            "Project gained field(s) "
            + ", ".join(sorted(unknown))
            + " that the core-schema selection rule does not classify. Add each one to "
            "CORE_PROJECT_PROPERTIES or OMITTED_PROJECT_PROPERTIES in "
            "visivo/commands/schema_phase.py."
        )

    kept_properties = {
        name: deepcopy(source_properties[name])
        for name in CORE_PROJECT_PROPERTIES
        if name in source_properties
    }

    # The root forbids unknown keys, so omitting a hand-authored field would
    # read as prohibiting it. Describe it nowhere; accept it everywhere.
    permissive_properties = {
        name: {
            "description": (
                f"{reason} Not described in the core subset -- run "
                "`visivo schema --full` for its schema. Accepted here so that a "
                "project already using it still validates."
            )
        }
        for name, reason in OMITTED_PROJECT_PROPERTIES.items()
        if name not in MACHINE_SET_FIELDS and name in source_properties
    }

    roots: Set[str] = set()
    _ref_names(kept_properties, roots)
    reachable = _reachable_defs(roots, defs)

    kept_defs = {name: deepcopy(defs[name]) for name in sorted(reachable)}
    classes = _model_classes()
    for name, definition in kept_defs.items():
        properties = definition.get("properties")
        if isinstance(properties, dict):
            strip = MACHINE_SET_FIELDS - _authored_machine_set_fields(name, classes)
            for field in strip:
                properties.pop(field, None)
            required = definition.get("required")
            if isinstance(required, list):
                definition["required"] = [f for f in required if f not in strip]

    _repair_unsatisfiable_one_ofs(kept_defs)
    _repair_unsatisfiable_one_ofs(kept_properties)

    for definition in kept_defs.values():
        _restore_keyword_aliases(definition)

    for definition in kept_defs.values():
        for prop in (definition.get("properties") or {}).values():
            _strip_property_titles(prop)
    for prop in kept_properties.values():
        _strip_property_titles(prop)

    schema: Dict[str, Any] = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": source.get("title", "Project"),
        "description": source.get("description"),
        "type": source.get("type", "object"),
        "additionalProperties": source.get("additionalProperties", False),
        "x-visivo-schema": {
            "mode": "core",
            "cli_version": VISIVO_VERSION,
            "generated_by": "visivo schema --core",
            "selection_rule": "visivo/commands/schema_phase.py -- see the module docstring",
            "omitted_project_properties": OMITTED_PROJECT_PROPERTIES,
            "pruned_vocabularies": PRUNED_VOCABULARY_NOTE,
            "full_schema_command": "visivo schema --full",
        },
        "properties": {**kept_properties, **permissive_properties},
        "$defs": kept_defs,
    }
    return schema


def props_schema(prop_type: str) -> Dict[str, Any]:
    """The full Plotly property schema for one insight ``props.type``."""
    from visivo.models.props.types import PropType

    valid = [member.value for member in PropType]
    normalized = (prop_type or "").strip().lower()
    if normalized not in valid:
        raise SchemaSelectionError(
            f"Unknown insight props type '{prop_type}'. Valid types: " + ", ".join(sorted(valid))
        )
    return _vendored_schema(f"{normalized}.schema.json")


def layout_schema() -> Dict[str, Any]:
    """The full Plotly layout schema (what ``Chart.layout`` accepts)."""
    return _vendored_schema("layout.schema.json")


def _vendored_schema(file_name: str) -> Dict[str, Any]:
    from importlib.resources import files

    return json.loads(files("visivo.schema").joinpath(file_name).read_text())


def schema_phase(
    core: bool = False,
    full: bool = False,
    prop_type: Optional[str] = None,
    layout: bool = False,
    indent: Optional[int] = None,
) -> str:
    """Return the requested schema as a JSON string.

    Exactly one selector may be given. With none, the core authoring subset is
    returned, because that is the one an agent should be reading; ``core=True``
    asks for the same thing explicitly.
    """
    selectors = [
        name for name, on in (("--core", core), ("--full", full), ("--layout", layout)) if on
    ]
    if prop_type:
        selectors.append("--props")
    if len(selectors) > 1:
        raise SchemaSelectionError(
            "Pass only one of " + ", ".join(selectors) + ". They select different schemas."
        )

    if full:
        schema = full_schema()
    elif layout:
        schema = layout_schema()
    elif prop_type:
        schema = props_schema(prop_type)
    else:
        schema = core_schema()

    return json.dumps(schema, indent=indent)
