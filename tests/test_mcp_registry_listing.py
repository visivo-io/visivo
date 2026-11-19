"""server.json is the listing the official MCP registry reads (VIS-1809).

The registry rejects a listing whose package does not carry its name, and a
client installs the package version the listing gives.
"""

import importlib.util
import json
import re
import tomllib
from pathlib import Path

from click.testing import CliRunner

from visivo.version import VISIVO_VERSION

ROOT = Path(__file__).resolve().parents[1]
LISTING = json.loads((ROOT / "server.json").read_text())
PACKAGE = LISTING["packages"][0]
PYPROJECT = tomllib.loads((ROOT / "pyproject.toml").read_text())["project"]


def test_it_has_what_the_registry_requires():
    assert re.fullmatch(r"[a-zA-Z0-9.-]+/[a-zA-Z0-9._-]+", LISTING["name"])
    assert 1 <= len(LISTING["description"]) <= 100
    assert LISTING["$schema"].endswith("/server.schema.json")


def test_the_readme_pypi_publishes_claims_the_name():
    assert PYPROJECT["readme"] == "README.md"
    assert f"mcp-name: {LISTING['name']}" in (ROOT / "README.md").read_text()


def test_it_names_the_package_and_version_this_repo_builds():
    assert PACKAGE["registryType"] == "pypi"
    assert PACKAGE["identifier"] == PYPROJECT["name"]
    assert LISTING["version"] == PACKAGE["version"] == VISIVO_VERSION == PYPROJECT["version"]


def test_it_starts_a_command_the_cli_has():
    from visivo.command_line import visivo

    assert PACKAGE["transport"] == {"type": "stdio"}
    arguments = [argument["value"] for argument in PACKAGE["packageArguments"]]
    assert arguments == ["mcp"]
    assert CliRunner().invoke(visivo, [*arguments, "--help"]).exit_code == 0


def test_the_release_script_moves_both_versions(tmp_path):
    script = ROOT / ".github" / "scripts" / "set_server_json_version.py"
    spec = importlib.util.spec_from_file_location("set_server_json_version", script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    copy = tmp_path / "server.json"
    copy.write_text((ROOT / "server.json").read_text())

    module.set_version(copy, "9.8.7")

    moved = json.loads(copy.read_text())
    assert moved["version"] == moved["packages"][0]["version"] == "9.8.7"
    assert {**moved, "version": 0, "packages": 0} == {**LISTING, "version": 0, "packages": 0}


def test_the_release_workflow_runs_the_script():
    workflow = (ROOT / ".github" / "workflows" / "release.yml").read_text()

    assert "set_server_json_version.py ${{ inputs.version }}" in workflow
