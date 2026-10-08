"""What the agent can do with a template dashboard (VIS-1389).

The schema slice, the tools and the skill are three separate things that each
have to know templates exist, and none of them fails loudly if it does not — a
slice missing the variant just produces an agent that never writes one. So each
is asserted here rather than assumed from the model being correct.
"""

from visivo.agent import skills, tools
from visivo.agent.schema import SchemaSlicer
from tests.server.conftest import (  # noqa: F401
    integration_app,
    integration_client,
    output_dir,
)

# `new_table` is a real table in the integration project. It matters that the
# happy path names something that exists, because an unknown slot validates too
# — see TestTheTrapsTheSkillTeaches.
TEMPLATE = """
<style>.wide { height: 420px; }</style>
<section>
  <div class="wide" data-visivo-item="new_table"></div>
</section>
"""


def _validate(app, config):
    return tools.call(app, "validate_dashboard", {"config": config})


class TestTheAgentCanWriteOne:
    def test_a_template_dashboard_validates(self, integration_app):
        assert _validate(integration_app, {"name": "t", "template": TEMPLATE}) == {"valid": True}

    def test_and_writes(self, integration_app):
        result = tools.call(
            integration_app,
            "write_dashboard",
            {"config": {"name": "written-template", "template": TEMPLATE}},
        )

        assert result["name"] == "written-template"
        written = tools.call(integration_app, "get_dashboard", {"name": "written-template"})
        assert "data-visivo-item" in written["template"]


class TestTheTrapsTheSkillTeaches:
    def test_a_template_file_key_is_not_recognised(self, integration_app):
        # Removed before it shipped, so the HTML travels with the config and a
        # runner working from a checkout cannot be missing it. An agent that
        # reaches for the old key is refused rather than silently writing an
        # empty dashboard.
        result = _validate(integration_app, {"name": "t", "template_file": "x.html"})

        assert result["valid"] is False
        assert "template_file" in result["error"]

    def test_disallowed_html_is_refused_with_line_numbers(self, integration_app):
        result = _validate(
            integration_app,
            {
                "name": "t",
                "template": '<section onclick="x()">\n<script>y()</script>\n</section>',
            },
        )

        assert result["valid"] is False
        assert "line 1: event handler attribute `onclick`" in result["error"]
        assert "line 2: <script>" in result["error"]

    def test_an_unknown_slot_validates_and_fails_later(self, integration_app):
        # Deliberate, and the same as every other `${ref()}`: refs resolve when
        # the project compiles, not when one object is validated. A dangling
        # ref in a ROWS dashboard behaves identically, so templates are not a
        # special case — which is why the skill tells the agent to build items
        # first rather than relying on validate to catch it.
        template = _validate(
            integration_app,
            {"name": "t", "template": '<div data-visivo-item="nope"></div>'},
        )
        rows = _validate(
            integration_app,
            {"name": "t", "rows": [{"items": [{"chart": "${ref(nope)}"}]}]},
        )

        assert template == {"valid": True}
        assert template == rows


class TestTheAgentCanSeeTheVocabulary:
    def test_the_dashboard_schema_slice_carries_the_template_variant(self):
        # The slice is generated from the model, so this is really asserting
        # that nothing prunes the variant away on the path to the agent.
        import json

        slice_text = json.dumps(SchemaSlicer().for_type("dashboards"))

        assert "TemplateDashboard" in slice_text
        assert "data-visivo-item" in slice_text

    def test_the_skill_ships_and_reaches_the_prompt(self):
        # One copy, two readers: `as_prompt` feeds the built-in loop and
        # `packaged` feeds the MCP surface. Asserting the prompt covers both,
        # since it is built from `packaged`.
        assert "template-dashboards" in [s["name"] for s in skills.packaged()]
        assert "data-visivo-item" in skills.as_prompt()
