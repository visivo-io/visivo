import importlib.util
import json
import re
from pathlib import Path

import pytest
import yaml

from visivo.agent import skills as agent_skills
from visivo.agent.tools import tool_names
from visivo.command_line import visivo as cli
from visivo.commands.authorize import AUTHORIZE_SOURCE_ENV_VAR
from visivo.version import VISIVO_VERSION

REPO = Path(__file__).resolve().parents[1]
PLUGIN = REPO / "claude-plugin"
MANIFEST = PLUGIN / ".claude-plugin" / "plugin.json"
MARKETPLACE = REPO / ".claude-plugin" / "marketplace.json"
VERSION_SCRIPT = REPO / ".github" / "scripts" / "set_plugin_version.py"
SKILL_FILES = sorted((PLUGIN / "skills").glob("*/SKILL.md"))
RESERVED_NAME = re.compile(r"^(claude|anthropic|anthropics|cc-plugin)(-|$)")
USER_CONFIG_TYPES = {"string", "number", "boolean", "directory", "file"}
TOOL_VERBS = ("list", "get", "validate", "write", "check", "read", "recommend")


def _manifest():
    return json.loads(MANIFEST.read_text())


def _servers():
    config = json.loads((PLUGIN / ".mcp.json").read_text())
    return config.get("mcpServers", config)


def _skill(path):
    text = path.read_text()
    assert text.startswith("---\n"), f"{path} has no front matter"
    front, body = text[4:].split("\n---\n", 1)
    return yaml.safe_load(front), body


def _all_skill_text():
    return "\n".join(path.read_text() for path in SKILL_FILES)


def test_manifest_names_the_plugin_and_tracks_the_release_version():
    manifest = _manifest()

    assert manifest["name"] == "visivo"
    assert not RESERVED_NAME.match(manifest["name"])
    assert manifest["version"] == VISIVO_VERSION
    assert manifest["description"]
    assert manifest["author"]["name"]


def test_manifest_listing_urls_are_https():
    manifest = _manifest()

    for key in ("homepage", "documentationUrl", "supportUrl", "privacyPolicyUrl"):
        assert manifest[key].startswith("https://"), key


def test_user_config_options_use_only_fields_claude_code_accepts():
    allowed = {
        "type",
        "title",
        "description",
        "required",
        "default",
        "options",
        "multiple",
        "sensitive",
        "min",
        "max",
    }

    for key, option in _manifest()["userConfig"].items():
        assert re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key)
        assert set(option) <= allowed, key
        assert option["type"] in USER_CONFIG_TYPES
        assert option["title"] and option["description"]


def test_mcp_server_reads_a_declared_user_config_option():
    servers = _servers()
    declared = set(_manifest()["userConfig"])

    assert set(servers) == {"visivo"}
    assert servers["visivo"]["type"] == "http"
    referenced = re.findall(r"\$\{user_config\.(\w+)\}", servers["visivo"]["url"])
    assert referenced and set(referenced) <= declared


def test_default_server_url_is_the_local_mcp_route():
    default = _manifest()["userConfig"]["server_url"]["default"]
    views = (REPO / "visivo" / "server" / "views" / "mcp_views.py").read_text()

    assert default == "http://localhost:8000/api/mcp/"
    assert '@app.route("/api/mcp/"' in views


def test_marketplace_lists_the_plugin_directory():
    marketplace = json.loads(MARKETPLACE.read_text())
    entries = {entry["name"]: entry for entry in marketplace["plugins"]}

    assert marketplace["name"] == "visivo"
    assert marketplace["owner"]["name"]
    assert set(entries) == {_manifest()["name"]}
    source = entries["visivo"]["source"]
    assert source.startswith("./") and ".." not in source
    assert (REPO / source).resolve() == PLUGIN
    assert "version" not in entries["visivo"]


def test_each_skill_has_a_name_and_a_description():
    assert [path.parent.name for path in SKILL_FILES] == ["deploy", "mcp-drafts", "project-files"]
    for path in SKILL_FILES:
        front, body = _skill(path)
        assert front["name"] == path.parent.name
        assert 20 <= len(front["description"]) <= 1024
        assert body.strip()


def test_skills_name_only_mcp_tools_that_exist():
    known = set(tool_names())
    pattern = r"`((?:%s)_[a-z_]+)`" % "|".join(TOOL_VERBS)
    named = set(re.findall(pattern, _all_skill_text()))

    assert {"read_skill", "get_schema", "check_runs", "list_sources", "list_models"} <= named
    assert named <= known, sorted(named - known)


def test_skills_name_only_packaged_skills_that_exist():
    packaged = {skill["name"] for skill in agent_skills.packaged()}

    for name in ("build-a-model", "metrics-and-dimensions", "choose-a-chart", "design-a-dashboard"):
        assert f"`{name}`" in _all_skill_text()
        assert name in packaged


def test_skills_name_only_cli_commands_and_options_that_exist():
    text = _all_skill_text()
    used = {
        "init": ["--bare"],
        "compile": ["--working-dir"],
        "run": [],
        "test": [],
        "serve": ["--port"],
        "authorize": ["--replace"],
        "deploy": ["--branch", "--force"],
    }

    for command, options in used.items():
        assert f"visivo {command}" in text
        declared = {opt for param in cli.commands[command].params for opt in param.opts}
        for option in options:
            assert option in text
            assert option in declared, f"visivo {command} has no {option}"


def test_deploy_skill_sets_the_authorize_source_the_cli_reads():
    deploy = (PLUGIN / "skills" / "deploy" / "SKILL.md").read_text()

    assert f"{AUTHORIZE_SOURCE_ENV_VAR}=plugin visivo authorize" in deploy


def test_mcp_skill_scopes_the_draft_rule_to_the_mcp_tools():
    packaged = {skill["name"]: skill for skill in agent_skills.packaged()}
    mcp = (PLUGIN / "skills" / "mcp-drafts" / "SKILL.md").read_text()

    assert "You cannot commit, deploy or delete" in packaged["committing-work"]["text"]
    assert "you cannot commit, deploy or delete. That rule is about the MCP tools." in mcp


def test_plugin_has_no_root_bin_or_claude_md():
    assert not (PLUGIN / "bin").exists()
    assert not (PLUGIN / "CLAUDE.md").exists()


def test_release_writes_the_version_into_the_manifest(tmp_path):
    spec = importlib.util.spec_from_file_location("set_plugin_version", VERSION_SCRIPT)
    script = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(script)
    copy = tmp_path / "plugin.json"
    copy.write_text(MANIFEST.read_text())

    script.set_version(copy, "9.9.9")

    written = json.loads(copy.read_text())
    assert written["version"] == "9.9.9"
    assert {k: v for k, v in written.items() if k != "version"} == {
        k: v for k, v in _manifest().items() if k != "version"
    }
    assert (REPO / script.DEFAULT_MANIFEST) == MANIFEST


def test_release_workflow_runs_the_version_script():
    workflow = (REPO / ".github" / "workflows" / "release.yml").read_text()

    assert "python .github/scripts/set_plugin_version.py ${{ inputs.version }}" in workflow


def test_committed_manifest_matches_what_the_version_script_writes():
    assert MANIFEST.read_text() == json.dumps(_manifest(), indent=2) + "\n"
