"""
Emit the Visivo project JSON Schema in a form an agent can actually consume.

The schema that ships in ``visivo/src/visivo_project_schema.json`` is ~3.3 MB
across 103 ``$defs``.  It is the right thing for the viewer (which validates
every Plotly property client side) and the wrong thing for an LLM: nobody can
put 3.3 MB in a prompt, so agents guess at Visivo's grammar instead of reading
it.  ``visivo schema`` exists to hand an agent the part of that schema that
describes *a Visivo project* -- roughly 90 KB, ~23k tokens, cacheable.

THE CORE SELECTION RULE
=======================

The subset is *derived*, not hand-maintained.  Five mechanical steps, each of
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
   one of the two -- ``test_schema_phase.py`` fails if the model grows a field
   that neither list mentions, so this stays honest as the model evolves.

3. **Transitively close over ``$ref`` from those roots** and drop every
   ``$def`` nothing reaches.

4. **Delete the machine-set fields** (``MACHINE_SET_FIELDS``) from every
   object.  The CLI fills these in; an agent that writes them is making a
   mistake, and they cost ~9 KB across 45 defs.

5. **Delete Pydantic's auto-generated property titles.**  ``"title": "Source
   Name"`` above a property literally named ``source_name`` is ~4 KB of
   restatement.  Titles on the ``$defs`` themselves are kept.

6. **Restore the Python-keyword aliases.**  ``Test.if_`` and ``Alert.if_`` carry
   a trailing underscore because ``if`` is a reserved word in Python; the key
   people actually write in YAML -- and that every doc example shows -- is
   ``if``.  The schema is dumped with ``by_alias=False``, so any property named
   ``<keyword>_`` is emitted under the bare keyword as well, and the underscore
   spelling is marked ``deprecated`` so an agent picks the right one.  The test
   is ``name[:-1] in keyword.kwlist``, which is why this does *not* drag in the
   1.0-era ``targets``/``target`` aliases that ``by_alias=True`` would.

Caveat, stated plainly because step 4 has a real edge: the core schema is an
*authoring* contract.  Because ``Project`` and its objects are
``extra="forbid"``, stripping the machine-set fields means the core schema
rejects a document that carries them -- notably the ``project.json`` the CLI
writes at compile time, and any object round-tripped out of the server API.
Validate hand-written YAML with ``--core``; validate compiler output with
``--full``.
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

#: ``Project`` fields deliberately left out of the core subset, each with the
#: reason.  Kept as data (not a comment) so the guard test can assert that
#: CORE + OMITTED covers every field ``Project`` actually has.
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

#: Step 4: fields the CLI fills in, removed from every object in the subset.
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


def _restore_keyword_aliases(definition: Dict[str, Any]) -> None:
    """Step 6: ``if_`` also accepted (and preferred) as ``if``."""
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
    """The authoring subset, derived by the five steps in the module docstring."""
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

    roots: Set[str] = set()
    _ref_names(kept_properties, roots)
    reachable = _reachable_defs(roots, defs)

    kept_defs = {name: deepcopy(defs[name]) for name in sorted(reachable)}
    for definition in kept_defs.values():
        properties = definition.get("properties")
        if isinstance(properties, dict):
            for field in MACHINE_SET_FIELDS:
                properties.pop(field, None)
            required = definition.get("required")
            if isinstance(required, list):
                definition["required"] = [f for f in required if f not in MACHINE_SET_FIELDS]

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
        "properties": kept_properties,
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
    full: bool = False,
    prop_type: Optional[str] = None,
    layout: bool = False,
    indent: Optional[int] = None,
) -> str:
    """Return the requested schema as a JSON string.

    Exactly one selector may be given. With none, the core authoring subset is
    returned, because that is the one an agent should be reading.
    """
    selectors = [name for name, on in (("--full", full), ("--layout", layout)) if on]
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
