import json
import os
import re
import shlex

from click.testing import CliRunner

from visivo.commands.schema import schema
from visivo.models.props.types import PropType
from tests.support.utils import temp_folder

runner = CliRunner()


def test_schema_emits_valid_json_on_stdout():
    response = runner.invoke(schema, [])

    assert response.exit_code == 0
    document = json.loads(response.stdout)
    assert document["x-visivo-schema"]["mode"] == "core"
    assert "SqlModel" in document["$defs"]


def test_schema_stdout_carries_nothing_but_the_document():
    """An agent pipes this into a parser; a banner line would break it."""
    response = runner.invoke(schema, [])

    assert response.stdout.lstrip().startswith("{")
    assert response.stdout.rstrip().endswith("}")
    json.loads(response.stdout)


def test_schema_full_includes_the_plotly_vocabulary():
    response = runner.invoke(schema, ["--full"])

    assert response.exit_code == 0
    document = json.loads(response.stdout)
    assert "Bar" in document["$defs"]
    assert len(document["$defs"]["Layout"].get("properties", {})) > 50


def test_schema_props_emits_one_trace_type():
    response = runner.invoke(schema, ["--props", "bar"])

    assert response.exit_code == 0
    document = json.loads(response.stdout)
    assert "properties" in document
    # This is exactly what --core prunes: tens of thousands of bytes of Plotly.
    assert len(response.stdout) > 50_000


def test_schema_props_rejects_an_unknown_type():
    response = runner.invoke(schema, ["--props", "barchart"])

    assert response.exit_code != 0
    assert "barchart" in response.output
    # The error enumerates what IS valid, so an agent can self-correct.
    assert "scatter" in response.output


def test_schema_layout_emits_the_layout_vocabulary():
    response = runner.invoke(schema, ["--layout"])

    assert response.exit_code == 0
    assert len(json.loads(response.stdout)["properties"]) > 50
    assert len(response.stdout) > 100_000


def test_schema_rejects_two_selectors():
    response = runner.invoke(schema, ["--full", "--layout"])

    assert response.exit_code != 0
    assert "--full" in response.output


def test_schema_writes_to_a_file():
    output = os.path.join(temp_folder(), "core.json")
    os.makedirs(os.path.dirname(output), exist_ok=True)

    response = runner.invoke(schema, ["-o", output])

    assert response.exit_code == 0
    with open(output) as file:
        document = json.load(file)
    assert document["x-visivo-schema"]["mode"] == "core"
    assert response.stdout.strip() == ""
    assert "Schema written to" in response.stderr


def test_schema_indent_pretty_prints():
    response = runner.invoke(schema, ["--indent", "2"])

    assert response.exit_code == 0
    assert '\n  "' in response.stdout
    json.loads(response.stdout)


def test_core_flag_matches_the_default():
    assert json.loads(runner.invoke(schema, ["--core"]).stdout) == json.loads(
        runner.invoke(schema, []).stdout
    )


def test_every_command_the_schema_advertises_actually_runs():
    """The `x-visivo-schema` block tells an agent what to run next. It must work."""
    document = json.loads(runner.invoke(schema, []).stdout)
    metadata = document["x-visivo-schema"]

    advertised = {metadata["generated_by"], metadata["full_schema_command"]}
    for note in metadata["pruned_vocabularies"].values():
        advertised.update(re.findall(r"`(visivo schema[^`]*)`", note))

    assert advertised, "the schema advertises no commands at all"
    for command in sorted(advertised):
        args = shlex.split(command)
        assert args[:2] == ["visivo", "schema"], command
        # `--props <type>` is a template; substitute a real type to run it.
        args = ["bar" if arg == "<type>" else arg for arg in args[2:]]
        response = runner.invoke(schema, args)
        assert response.exit_code == 0, f"`{command}` does not run: {response.output[:200]}"


def test_every_prop_type_is_emittable():
    """--props is the escape hatch for the vocabulary --core prunes: it must cover all of it."""
    for prop_type in PropType:
        response = runner.invoke(schema, ["--props", prop_type.value])
        assert response.exit_code == 0, f"--props {prop_type.value} failed"
        json.loads(response.stdout)
