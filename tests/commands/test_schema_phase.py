import glob
import json
import os

import jsonschema_rs
import pytest
import yaml

from visivo.commands.schema_phase import (
    CORE_PROJECT_PROPERTIES,
    MACHINE_SET_FIELDS,
    OMITTED_PROJECT_PROPERTIES,
    SchemaSelectionError,
    core_schema,
    full_schema,
    layout_schema,
    props_schema,
    schema_phase,
)
from visivo.models.project import Project
from visivo.models.props.types import PropType

SAMPLES_GLOB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "visivo",
    "templates",
    "samples",
    "*",
    "project.visivo.yml",
)


def sample_project_files():
    files = sorted(glob.glob(SAMPLES_GLOB))
    assert files, f"No sample projects found at {SAMPLES_GLOB}"
    return files


def test_core_schema_is_valid_json_schema():
    schema = core_schema()
    # Compiling the schema is the real assertion: jsonschema_rs raises if any
    # $ref dangles or any keyword is malformed.
    jsonschema_rs.validator_for(schema)
    assert schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"
    assert schema["type"] == "object"


def test_core_schema_fits_in_a_prompt():
    """The whole point: the full schema cannot go in a prompt, the core one can."""
    core_bytes = len(json.dumps(core_schema()))
    full_bytes = len(json.dumps(full_schema()))
    assert core_bytes < 100_000, f"core schema grew to {core_bytes} bytes"
    assert full_bytes > 1_000_000
    assert core_bytes < full_bytes / 20


def test_core_schema_keeps_every_object_an_agent_authors():
    defs = core_schema()["$defs"]
    for name in (
        "SqlModel",
        "Metric",
        "Dimension",
        "Relation",
        "Insight",
        "InsightInteraction",
        "Chart",
        "Dashboard",
        "Row",
        "Item",
        "Markdown",
        "Table",
        "Seed",
        "SingleSelectInput",
        "MultiSelectInput",
    ):
        assert name in defs, f"{name} missing from the core subset"


def test_core_schema_keeps_every_source_type():
    """An agent connecting to Snowflake needs Snowflake, not just the easy sources."""
    defs = core_schema()["$defs"]
    for name in (
        "SqliteSource",
        "PostgresqlSource",
        "MysqlSource",
        "SnowflakeSource",
        "BigQuerySource",
        "RedshiftSource",
        "DuckdbSource",
        "CSVFileSource",
        "ExcelFileSource",
        "ClickhouseSource",
    ):
        assert name in defs, f"{name} missing from the core subset"


def test_core_schema_prunes_the_plotly_vocabulary():
    schema = core_schema()
    defs = schema["$defs"]
    trace_defs = {member.value.capitalize() for member in PropType}
    assert not (trace_defs & set(defs)), "Plotly trace-prop defs leaked into the core subset"
    for vendored in ("xaxis", "yaxis", "colorscale"):
        assert vendored not in defs

    # Layout survives only as the open-object stub the $refs need; the 400 KB
    # Plotly layout is gone.
    assert len(json.dumps(defs["Layout"])) < 500
    assert defs["Layout"].get("additionalProperties") is True

    # ...and props still accepts any Plotly key, discriminated by `type`.
    props = defs["InsightProps"]
    assert props["additionalProperties"] is True
    assert props["required"] == ["type"]


def test_core_schema_classifies_every_project_field():
    """The selection rule must stay honest as Project grows fields."""
    classified = set(CORE_PROJECT_PROPERTIES) | set(OMITTED_PROJECT_PROPERTIES)
    actual = set(Project.model_json_schema(by_alias=False)["properties"])
    assert actual - classified == set(), "Project field(s) the selection rule does not classify"
    assert not (set(CORE_PROJECT_PROPERTIES) & set(OMITTED_PROJECT_PROPERTIES))


def test_core_schema_raises_when_a_project_field_is_unclassified(monkeypatch):
    monkeypatch.setattr(
        "visivo.commands.schema_phase.CORE_PROJECT_PROPERTIES",
        [name for name in CORE_PROJECT_PROPERTIES if name != "dashboards"],
    )
    with pytest.raises(SchemaSelectionError) as error:
        core_schema()
    assert "dashboards" in str(error.value)
    assert "CORE_PROJECT_PROPERTIES" in str(error.value)


def test_core_schema_root_holds_only_the_authoring_surface():
    schema = core_schema()
    assert list(schema["properties"]) == CORE_PROJECT_PROPERTIES
    for omitted in OMITTED_PROJECT_PROPERTIES:
        assert omitted not in schema["properties"]
    # Alerts and destinations are out, so their defs are unreachable and dropped.
    for name in ("Alert", "SlackDestination", "EmailDestination", "ConsoleDestination", "Dbt"):
        assert name not in schema["$defs"]


def test_core_schema_drops_machine_set_fields_everywhere():
    schema = core_schema()
    for name, definition in schema["$defs"].items():
        properties = definition.get("properties") or {}
        leaked = MACHINE_SET_FIELDS & set(properties)
        assert not leaked, f"{name} still exposes machine-set field(s) {sorted(leaked)}"
    assert not (MACHINE_SET_FIELDS & set(schema["properties"]))


def test_core_schema_has_no_unreachable_defs():
    schema = core_schema()
    referenced = set()

    def walk(node):
        if isinstance(node, dict):
            ref = node.get("$ref")
            if isinstance(ref, str) and ref.startswith("#/$defs/"):
                referenced.add(ref[len("#/$defs/") :])
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(schema["properties"])
    walk(schema["$defs"])
    assert set(schema["$defs"]) == referenced


def test_core_schema_restores_python_keyword_aliases():
    """`if_` is a Python artifact; the YAML key -- and every doc example -- is `if`."""
    test_def = core_schema()["$defs"]["Test"]
    assert "if" in test_def["properties"]
    assert test_def["properties"]["if_"]["deprecated"] is True
    assert "write `if` instead" in test_def["properties"]["if_"]["description"]
    # The 1.0-era source/target aliases must NOT come back this way.
    assert "target" not in core_schema()["$defs"]["SqlModel"]["properties"]
    assert "targets" not in core_schema()["properties"]


def test_core_schema_documents_its_own_selection_rule():
    metadata = core_schema()["x-visivo-schema"]
    assert metadata["mode"] == "core"
    assert metadata["omitted_project_properties"] == OMITTED_PROJECT_PROPERTIES
    assert "--props" in metadata["pruned_vocabularies"]["insight_props"]
    assert metadata["full_schema_command"] == "visivo schema --full"


@pytest.mark.parametrize("sample_path", sample_project_files())
def test_core_schema_validates_the_shipped_sample_projects(sample_path):
    """The contract is only worth shipping if real Visivo projects satisfy it."""
    validator = jsonschema_rs.validator_for(core_schema())
    with open(sample_path) as file:
        document = yaml.safe_load(file)
    errors = [str(error) for error in validator.iter_errors(document)]
    assert errors == [], f"{sample_path} does not validate against the core schema"


def test_core_schema_rejects_a_misspelled_key():
    """A schema that accepts anything would validate the samples too."""
    validator = jsonschema_rs.validator_for(core_schema())

    assert not validator.is_valid(
        {"name": "p", "models": [{"name": "m", "sql": "select 1", "sqll": "select 1"}]}
    ), "a misspelled key inside an object must be rejected"
    assert not validator.is_valid(
        {"name": "p", "modles": []}
    ), "a misspelled key at the project root must be rejected"
    assert validator.is_valid({"name": "p", "models": [{"name": "m", "sql": "select 1"}]})


def test_props_schema_returns_the_pruned_plotly_vocabulary():
    bar = props_schema("bar")
    assert len(json.dumps(bar)) > 50_000
    assert "properties" in bar
    assert props_schema("BAR ") == bar


def test_props_schema_rejects_an_unknown_type():
    with pytest.raises(SchemaSelectionError) as error:
        props_schema("barchart")
    assert "barchart" in str(error.value)
    assert "bar" in str(error.value)


def test_layout_schema_is_the_big_one():
    assert len(json.dumps(layout_schema())) > 100_000


def test_schema_phase_defaults_to_core_and_honours_indent():
    assert json.loads(schema_phase())["x-visivo-schema"]["mode"] == "core"
    assert "\n" in schema_phase(indent=2)
    assert "\n" not in schema_phase()


def test_schema_phase_rejects_two_selectors():
    with pytest.raises(SchemaSelectionError) as error:
        schema_phase(full=True, layout=True)
    assert "--full" in str(error.value)
    assert "--layout" in str(error.value)
