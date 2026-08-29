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
    _authored_machine_set_fields,
    _model_classes,
    _pydantic_project_schema,
    _validation_shape,
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
    """The whole point: the full schema cannot go in a prompt, the core one can.

    The ceiling is a prompt budget, not a size target -- roughly 30k tokens,
    with room for the models to grow. What actually keeps the schema small is
    the selection rule, guarded structurally below (no trace-prop defs, a
    `Layout` under 500 bytes); a ceiling with no headroom would just turn red
    for an ordinary model addition and say nothing about the rule.
    """
    core_bytes = len(json.dumps(core_schema()))
    full_bytes = len(json.dumps(full_schema()))
    assert core_bytes < 125_000, f"core schema grew to {core_bytes} bytes"
    assert full_bytes > 1_000_000
    assert core_bytes < full_bytes / 25


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


def test_core_schema_root_describes_only_the_authoring_surface():
    schema = core_schema()
    assert list(schema["properties"])[: len(CORE_PROJECT_PROPERTIES)] == CORE_PROJECT_PROPERTIES
    # Alerts and destinations are not *described*, so their defs are unreachable
    # and dropped -- which is the whole size win.
    for name in ("Alert", "SlackDestination", "EmailDestination", "ConsoleDestination", "Dbt"):
        assert name not in schema["$defs"]


def test_core_schema_accepts_the_omitted_but_authorable_root_fields():
    """Omitted must not mean prohibited: the root forbids unknown keys.

    `alerts`, `destinations` and `dbt` are undescribed because they are
    orthogonal to building a dashboard -- not because writing them is a
    mistake. Rejecting them would tell an agent that the user's own `alerts:`
    block is an illegal key, and the obvious repair is to delete it.
    """
    schema = core_schema()
    validator = jsonschema_rs.validator_for(schema)

    for name in OMITTED_PROJECT_PROPERTIES:
        if name in MACHINE_SET_FIELDS:
            # Machine-set: a document carrying these is compiler output, and
            # the core schema is deliberately an authoring contract.
            assert name not in schema["properties"]
            assert not validator.is_valid({"name": "p", name: "anything"})
            continue
        assert name in schema["properties"], f"{name} is omitted *and* prohibited"
        assert "--full" in schema["properties"][name]["description"]
        assert validator.is_valid({"name": "p", name: [{"anything": True}]})
        assert validator.is_valid({"name": "p", name: {"anything": True}})


def test_core_schema_validates_a_project_that_uses_alerts_and_includes():
    """The shapes real projects in this repo are written in."""
    validator = jsonschema_rs.validator_for(core_schema())
    document = {
        "name": "real",
        "includes": [{"path": "models/orders.yml"}, {"path": "dashboards/", "depth": 1}],
        "alerts": [{"name": "nightly", "destinations": [{"name": "slack"}]}],
        "destinations": [{"name": "slack", "type": "slack", "webhook_url": "https://x"}],
        "dbt": {"enabled": True},
    }
    assert [str(error) for error in validator.iter_errors(document)] == []


def test_core_schema_drops_inherited_machine_set_fields_but_keeps_declared_ones():
    """`MACHINE_SET_FIELDS` is a list of names, and a name is not proof.

    `Include` declares its own `path` -- the only key an include has. Stripping
    it by name leaves a definition that, being `additionalProperties: false`,
    rejects the example printed in `Include`'s own description.
    """
    schema = core_schema()
    for name, definition in schema["$defs"].items():
        properties = definition.get("properties") or {}
        kept = MACHINE_SET_FIELDS & set(properties)
        expected = _authored_machine_set_fields(name, _model_classes())
        assert kept == (expected & set(properties)), (
            f"{name} keeps machine-set field(s) {sorted(kept)}; "
            f"it declares {sorted(expected)} itself"
        )
    assert not (MACHINE_SET_FIELDS & set(schema["properties"]))


def test_core_schema_keeps_the_one_field_that_makes_includes_writable():
    schema = core_schema()
    assert "path" in schema["$defs"]["Include"]["properties"]
    # ...and every other object still loses the inherited one.
    assert "path" not in schema["$defs"]["SqlModel"]["properties"]
    assert "file_path" not in schema["$defs"]["SqlModel"]["properties"]

    validator = jsonschema_rs.validator_for(schema)
    assert validator.is_valid({"name": "p", "includes": [{"path": "models/orders.yml"}]})
    assert not validator.is_valid(
        {"name": "p", "models": [{"name": "m", "sql": "select 1", "path": "project.models[0]"}]}
    )


def test_core_schema_has_no_unsatisfiable_one_of():
    """Step 6a. A `oneOf` whose branches cannot discriminate rejects everything.

    Pydantic renders `SecretStrOrEnvVar` -- a union chosen by a Python callable
    -- as `oneOf: [{type: string}, {type: string, format: password}]`. Both
    branches accept every string, `oneOf` demands exactly one match, so the
    unrepaired schema rejects `password:` on all ten source types.
    """
    unsatisfiable = []

    def walk(node, path):
        if isinstance(node, dict):
            branches = node.get("oneOf")
            if isinstance(branches, list):
                shapes = [_validation_shape(branch) for branch in branches]
                if len(set(shapes)) < len(shapes):
                    unsatisfiable.append(path)
            for key, value in node.items():
                walk(value, f"{path}.{key}")
        elif isinstance(node, list):
            for index, value in enumerate(node):
                walk(value, f"{path}[{index}]")

    walk(core_schema(), "")
    assert unsatisfiable == [], f"unsatisfiable oneOf at {unsatisfiable[:5]}"

    # ...and there really were some to repair, so this cannot pass vacuously.
    walk(_pydantic_project_schema(), "")
    assert unsatisfiable, "the Pydantic dump no longer has any to repair"


def test_core_schema_accepts_a_password_on_every_source_type():
    validator = jsonschema_rs.validator_for(core_schema())

    for secret in ("hunter2", "${env.PG_PASSWORD}"):
        document = {
            "name": "p",
            "sources": [
                {
                    "name": "pg",
                    "type": "postgresql",
                    "database": "postgres",
                    "host": "localhost",
                    "username": "postgres",
                    "password": secret,
                }
            ],
        }
        errors = [str(error).splitlines()[0] for error in validator.iter_errors(document)]
        assert errors == [], f"password {secret!r} rejected: {errors}"


def test_core_schema_never_rejects_a_project_file_that_lives_in_this_repo():
    """Every hand-written project YAML in the repo must satisfy the contract.

    This is the test that catches a false negative the sample projects do not
    cover: the repo's projects use `includes:`, `alerts:`, `dbt:` and database
    passwords, and a subset that rejects any of those sends an agent to delete
    working configuration.

    The documented exception is the machine-set root keys. Two checked-in
    projects carry `path: project`, which is compiler bookkeeping, and the core
    schema rejects it on purpose -- "validate hand-written YAML with `--core`,
    compiler output with `--full`". Dropping them here keeps that decision
    explicit rather than hiding it; `test_core_schema_accepts_the_omitted_but
    _authorable_root_fields` asserts they are still rejected.
    """
    validator = jsonschema_rs.validator_for(core_schema())
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    paths = sorted(
        glob.glob(os.path.join(root, "test-projects", "**", "*.visivo.yml"), recursive=True)
    )
    assert len(paths) > 50, "expected the repo's test projects to be present"

    rejected = {}
    for path in paths:
        try:
            with open(path) as file:
                document = yaml.safe_load(file)
        except Exception:
            continue  # A deliberately broken YAML fixture; not this test's job.
        if not isinstance(document, dict):
            continue
        document = {key: value for key, value in document.items() if key not in MACHINE_SET_FIELDS}
        errors = [str(error).splitlines()[0] for error in validator.iter_errors(document)]
        if errors:
            rejected[os.path.relpath(path, root)] = errors[0]
    assert rejected == {}, f"{len(rejected)} project file(s) rejected by the core schema"


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


def test_core_schema_strips_pydantic_property_titles_but_keeps_def_titles():
    """Step 5. `"title": "Source Name"` above a key literally named
    `source_name` is restatement an agent pays tokens for; the `$def`'s own
    title is the type name and stays.
    """
    schema = core_schema()

    titled = [
        f"{name}.{key}"
        for name, definition in schema["$defs"].items()
        for key, prop in (definition.get("properties") or {}).items()
        if isinstance(prop, dict) and "title" in prop
    ]
    assert titled == [], f"property titles survived on {titled[:5]}"
    assert [key for key, prop in schema["properties"].items() if "title" in prop] == []

    # The definitions keep theirs -- that is the object's name, not a restatement.
    assert schema["$defs"]["SqlModel"]["title"] == "SqlModel"
    # ...and there really were titles to strip, so this test cannot pass vacuously.
    from visivo.commands.schema_phase import _pydantic_project_schema

    source = _pydantic_project_schema()
    assert "title" in source["$defs"]["SqlModel"]["properties"]["sql"]


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
