import json
import os
import re
import shlex
import subprocess
import sys

import pytest
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


# ---------------------------------------------------------------------------
# End-to-end stdout purity.
#
# CliRunner invokes the subcommand directly, never command_line.py -- which is
# where the banner, the timing line and the Halo spinner live. Only a real
# process proves the contract, so these shell out.
# ---------------------------------------------------------------------------


def _cli(*args):
    return subprocess.run(
        [sys.executable, "-m", "visivo.command_line", *args],
        capture_output=True,
        text=True,
        cwd=temp_folder_created(),
    )


def temp_folder_created():
    folder = temp_folder()
    os.makedirs(folder, exist_ok=True)
    return os.path.abspath(folder)


def test_end_to_end_schema_stdout_is_only_the_document():
    result = _cli("schema")

    assert result.returncode == 0
    document = json.loads(result.stdout)
    assert document["x-visivo-schema"]["mode"] == "core"
    assert "Starting Visivo" not in result.stdout
    assert "execution time" not in result.stdout


def test_end_to_end_schema_error_leaves_stdout_empty():
    """`visivo schema > core.json` must not write an error message into the file."""
    result = _cli("schema", "--core", "--full")

    assert result.returncode == 1
    assert result.stdout == ""
    assert "--core" in result.stderr


def test_end_to_end_compile_json_stdout_is_only_the_envelope():
    result = _cli("compile", "--json")

    assert json.loads(result.stdout)["command"] == "compile"
    assert "Starting Visivo" not in result.stdout
    assert "execution time" not in result.stdout


# The `visivo` group takes options *before* the subcommand, so `argv[1]` is not
# the command name.
GROUP_OPTIONS_BEFORE_THE_SUBCOMMAND = [
    ("-e", ".env"),
    ("--env-file=.env",),
    ("--verbose",),
    ("-p",),
    ("--verbose", "-e", ".env"),
]


@pytest.mark.parametrize("options", GROUP_OPTIONS_BEFORE_THE_SUBCOMMAND, ids=lambda o: " ".join(o))
def test_end_to_end_schema_stdout_stays_clean_behind_group_options(options):
    result = _cli(*options, "schema")

    assert result.returncode == 0, result.stderr[:400]
    assert "Starting Visivo" not in result.stdout
    assert "execution time" not in result.stdout
    assert "Profiling" not in result.stdout
    assert json.loads(result.stdout)["x-visivo-schema"]["mode"] == "core"


@pytest.mark.parametrize("options", GROUP_OPTIONS_BEFORE_THE_SUBCOMMAND, ids=lambda o: " ".join(o))
def test_end_to_end_schema_error_stays_off_stdout_behind_group_options(options):
    """`visivo -e .env schema > core.json` must leave an empty file on failure."""
    result = _cli(*options, "schema", "--core", "--full")

    assert result.returncode == 1
    assert result.stdout == "", f"error text landed on stdout: {result.stdout[:200]!r}"
    assert "--core" in result.stderr


@pytest.mark.parametrize("options", GROUP_OPTIONS_BEFORE_THE_SUBCOMMAND, ids=lambda o: " ".join(o))
def test_end_to_end_compile_json_stays_clean_behind_group_options(options):
    result = _cli(*options, "compile", "--json")

    document = json.loads(result.stdout)
    assert document["command"] == "compile"
    assert "Starting Visivo" not in result.stdout
    assert "execution time" not in result.stdout


def test_subcommand_is_found_past_the_group_options():
    """The unit behind the end-to-end tests above, including the cases that
    must *not* be read as a subcommand."""
    from visivo.command_line import _subcommand

    assert _subcommand(["visivo", "schema"]) == "schema"
    assert _subcommand(["visivo", "-e", ".env", "schema"]) == "schema"
    assert _subcommand(["visivo", "--env-file=.env", "schema"]) == "schema"
    assert _subcommand(["visivo", "-e.env", "schema"]) == "schema"
    assert _subcommand(["visivo", "--verbose", "-p", "schema", "--core"]) == "schema"
    assert _subcommand(["visivo", "compile", "--json"]) == "compile"
    # `schema` here is the value of --env-file, not the command.
    assert _subcommand(["visivo", "-e", "schema"]) is None
    assert _subcommand(["visivo"]) is None
    assert _subcommand(["visivo", "--version"]) is None
