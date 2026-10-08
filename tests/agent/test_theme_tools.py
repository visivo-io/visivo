"""The agent can read and change the project's theme (VIS-1390).

The theme is a singleton, so it has no manager and the generated per-type
tools skip it — it needed its own three. These run against the real Flask app
for the same reason the rest of tests/agent does: a registry that agrees with
a mock tells you nothing about whether it agrees with the one the HTTP routes
drive.
"""

import pytest

from visivo.agent import tools
from visivo.agent.schema import SchemaSlicer
from tests.server.conftest import (  # noqa: F401
    integration_app,
    integration_client,
    output_dir,
)

THEME = {
    "mode": "dark",
    "accent": "#2d6a6f",
    "colorway": ["#0a9396", "#d25946"],
}


class TestReadingIt:
    def test_get_theme_answers_even_when_none_is_set(self, integration_app):
        # `{}` rather than an error: "this project has no theme" is a real
        # answer, and the built-in one applies.
        assert tools.call(integration_app, "get_theme", {}) == {}

    def test_get_theme_returns_what_was_written(self, integration_app):
        tools.call(integration_app, "write_theme", {"config": THEME})

        stored = tools.call(integration_app, "get_theme", {})

        assert stored["mode"] == "dark"
        assert stored["accent"] == "#2d6a6f"
        assert stored["colorway"] == ["#0a9396", "#d25946"]


class TestWritingIt:
    def test_write_theme_drafts_it(self, integration_app):
        result = tools.call(integration_app, "write_theme", {"config": THEME})

        assert result["status"] == "draft"
        assert result["theme"]["accent"] == "#2d6a6f"
        assert integration_app._cached_theme is not None

    def test_a_write_replaces_rather_than_merges(self, integration_app):
        # A singleton has no name to merge on. The tool says so, and this pins
        # it: an agent that sends a partial config loses the rest, which is why
        # the description tells it to read first.
        tools.call(integration_app, "write_theme", {"config": THEME})

        tools.call(integration_app, "write_theme", {"config": {"mode": "light"}})

        stored = tools.call(integration_app, "get_theme", {})
        assert stored["mode"] == "light"
        assert "accent" not in stored

    def test_an_invalid_theme_is_refused_and_changes_nothing(self, integration_app):
        tools.call(integration_app, "write_theme", {"config": THEME})

        with pytest.raises(tools.ToolError, match="Invalid theme"):
            tools.call(integration_app, "write_theme", {"config": {"accent": "chartreuse"}})

        assert tools.call(integration_app, "get_theme", {})["accent"] == "#2d6a6f"

    def test_an_unknown_token_is_refused(self, integration_app):
        # ThemeTokens forbids extras, so a plausible-sounding invention fails
        # rather than being silently dropped.
        with pytest.raises(tools.ToolError, match="Invalid theme"):
            tools.call(integration_app, "write_theme", {"config": {"primary_color": "#fff"}})


class TestValidating:
    def test_a_good_theme_validates(self, integration_app):
        assert tools.call(integration_app, "validate_theme", {"config": THEME}) == {"valid": True}

    def test_a_bad_colour_is_reported_rather_than_raised(self, integration_app):
        result = tools.call(integration_app, "validate_theme", {"config": {"accent": "chartreuse"}})

        assert result["valid"] is False
        assert "hex color" in result["error"]

    def test_validating_does_not_write(self, integration_app):
        tools.call(integration_app, "validate_theme", {"config": THEME})

        assert integration_app._cached_theme is None


class TestTheAgentCanSeeTheVocabulary:
    def test_get_schema_slices_the_theme(self, integration_app):
        slice_ = tools.call(integration_app, "get_schema", {"type": "theme"})

        properties = slice_["$defs"]["Theme"]["properties"]
        for token in ("colorway", "font_family", "accent", "mode", "light", "dark"):
            assert token in properties

    def test_the_slice_is_small_enough_to_read(self):
        # The point of slicing: the whole project schema is megabytes, mostly
        # Plotly. A theme's own vocabulary is a few KB.
        import json

        assert len(json.dumps(SchemaSlicer().for_type("theme"))) < 20_000


class TestItReachesTheWholeAgentSurface:
    def test_the_mcp_transport_advertises_them(self, integration_client):
        # One toolset, two transports. A tool the built-in loop has and an
        # external MCP client does not is two products.
        response = integration_client.post(
            "/api/mcp/",
            json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
        )

        advertised = {t["name"] for t in response.get_json()["result"]["tools"]}
        assert {"get_theme", "write_theme", "validate_theme"} <= advertised

    def test_an_agent_theme_edit_shows_up_as_a_pending_change(
        self, integration_app, integration_client
    ):
        # The whole point: an agent's theme edit has to reach the same commit
        # path a human's does, so it is reviewed and written to YAML together
        # with everything else.
        before = integration_client.get("/api/projects/project/changes/").get_json()

        tools.call(integration_app, "write_theme", {"config": {"mode": "dark"}})
        after = integration_client.get("/api/projects/project/changes/").get_json()

        assert {"name": "theme", "type": "theme", "status": "modified"} not in before["to_publish"]
        assert {"name": "theme", "type": "theme", "status": "modified"} in after["to_publish"]

    def test_the_skill_ships_and_reaches_the_prompt(self):
        from visivo.agent import skills

        assert "theming-a-project" in [s["name"] for s in skills.packaged()]
        assert "`theming-a-project`" in skills.as_prompt(), "indexed, so the agent can read it"
        assert "write_theme" in skills.body("theming-a-project")
