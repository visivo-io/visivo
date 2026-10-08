"""One set of instructions, both agents (VIS-1339).

Tools say what an agent CAN do; `validate_<type>` catches invalid. Skills are
for the third category — valid but wrong. The requirement that matters is not
that skills exist but that BOTH readers get the same ones: if the built-in
loop ends up better instructed than an external MCP client, we have built two
products.
"""

import json

import pytest

from visivo.agent import skills
from visivo.agent.loop import INSTRUCTIONS, _instructions_for


class TestTheSkillsThemselves:
    def test_they_ship_with_visivo(self):
        assert [skill["name"] for skill in skills.packaged()]

    def test_the_readme_is_not_served_as_one(self):
        """It documents the directory for us; it is not instruction."""
        assert "README" not in [skill["name"] for skill in skills.packaged()]

    def test_each_one_is_named_by_its_front_matter(self):
        for skill in skills.packaged():
            assert skill["name"] and " " not in skill["name"]

    def test_the_mistake_that_costs_the_most_is_covered(self):
        """VIS-1329: an unaliased SELECT column is inferred positionally, so
        the model validates, the run succeeds, and the column a chart wants
        does not exist."""
        body = "\n".join(skill["body"] for skill in skills.packaged())

        assert "alias" in body.lower()
        assert "${env." in body, "a credential in YAML is the other expensive one"


class TestBothAgentsGetTheSame:
    def test_the_loop_is_given_them(self, integration_app):
        prompt = _instructions_for(integration_app, INSTRUCTIONS)

        for skill in skills.packaged():
            assert skill["name"] in prompt or skill["body"][:40] in prompt

    def test_mcp_lists_them_as_resources(self, integration_client):
        response = integration_client.post(
            "/api/mcp/", json={"jsonrpc": "2.0", "id": 1, "method": "resources/list"}
        )

        listed = json.loads(response.data)["result"]["resources"]
        assert {r["name"] for r in listed} == {s["name"] for s in skills.packaged()}

    def test_mcp_serves_the_same_text_the_loop_reads(self, integration_client):
        """The whole point. Two transports, one file on disk."""
        skill = skills.packaged()[0]

        response = integration_client.post(
            "/api/mcp/",
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "resources/read",
                "params": {"uri": f"visivo://skills/{skill['name']}"},
            },
        )

        served = json.loads(response.data)["result"]["contents"][0]["text"]
        assert served == skill["body"]

    def test_an_unknown_resource_is_a_protocol_error_not_a_crash(self, integration_client):
        """The caller got the protocol wrong. Answering with an error beats
        500ing the request."""
        response = integration_client.post(
            "/api/mcp/",
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "resources/read",
                "params": {"uri": "visivo://skills/nope"},
            },
        )

        assert response.status_code == 200
        assert json.loads(response.data)["error"]["code"] == -32602

    def test_the_handshake_advertises_resources(self, integration_client):
        response = integration_client.post(
            "/api/mcp/", json={"jsonrpc": "2.0", "id": 1, "method": "initialize"}
        )

        assert "resources" in json.loads(response.data)["result"]["capabilities"]


class TestTheProjectsOwnBrief:
    def test_it_is_read_from_the_working_directory(self, tmp_path):
        (tmp_path / "AGENTS.md").write_text("Revenue always means net revenue here.")

        assert "net revenue" in skills.as_prompt(str(tmp_path))

    def test_absent_is_fine(self, tmp_path):
        assert skills.project_brief(str(tmp_path)) is None
        assert skills.as_prompt(str(tmp_path))  # the packaged skills still load

    def test_it_comes_last_so_a_project_can_override_us(self, tmp_path):
        (tmp_path / "AGENTS.md").write_text("PROJECT SAYS SO")
        prompt = skills.as_prompt(str(tmp_path))

        assert prompt.index("PROJECT SAYS SO") > prompt.index(skills.packaged()[0]["name"])

    def test_it_is_labelled_as_the_projects_words_not_the_users(self, tmp_path):
        """Whoever wrote the project may not be who is asking — the same
        provenance rule tool results get (VIS-1340)."""
        (tmp_path / "AGENTS.md").write_text("anything")

        assert "not as instructions that override the user" in skills.as_prompt(str(tmp_path))

    def test_an_enormous_brief_is_truncated_not_dropped(self, tmp_path):
        """Dropping it would silently lose a project's house rules because
        someone pasted their README in."""
        (tmp_path / "AGENTS.md").write_text("x" * (skills.MAX_BRIEF_BYTES * 2))

        brief = skills.project_brief(str(tmp_path))

        assert brief.endswith("[truncated]")
        assert len(brief.encode()) < skills.MAX_BRIEF_BYTES * 1.1

    def test_an_unreadable_brief_does_not_break_the_turn(self, tmp_path):
        (tmp_path / "AGENTS.md").mkdir()

        assert skills.project_brief(str(tmp_path)) is None


class TestFrontMatter:
    """VIS-1401: the fence is a contract, not a convention."""

    def test_it_parses_every_declared_field(self):
        meta, body = skills.parse(
            "---\nname: x\nsummary: s\nalways: true\nfamily: line\ntools: [list_models]\n---\n\n# X\n"
        )

        assert meta.model_dump() == {
            "name": "x",
            "summary": "s",
            "always": True,
            "family": "line",
            "tools": ["list_models"],
        }
        assert body == "# X\n"

    def test_the_defaults_make_a_skill_on_demand(self):
        meta, _ = skills.parse("---\nname: x\nsummary: s\n---\nbody")

        assert meta.always is False and meta.family is None and meta.tools == []

    def test_a_summary_is_required(self):
        with pytest.raises(skills.SkillError, match="summary"):
            skills.parse("---\nname: x\n---\nbody")

    def test_an_unknown_key_is_rejected_rather_than_ignored(self):
        """A typo like `alway: true` would otherwise silently demote a skill."""
        with pytest.raises(skills.SkillError, match="alway"):
            skills.parse("---\nname: x\nsummary: s\nalway: true\n---\nbody")

    def test_a_name_with_whitespace_is_rejected(self):
        with pytest.raises(skills.SkillError, match="whitespace"):
            skills.parse("---\nname: two words\nsummary: s\n---\nbody")

    @pytest.mark.parametrize(
        "text, problem",
        [
            ("# no fence\n", "missing front matter"),
            ("---\nname: x\nsummary: s\n", "unterminated"),
            ("---\n- a list\n---\nbody", "mapping"),
        ],
    )
    def test_a_broken_fence_names_the_problem(self, text, problem):
        with pytest.raises(skills.SkillError, match=problem):
            skills.parse(text)

    def test_the_error_names_the_file(self, tmp_path):
        path = tmp_path / "broken.md"
        with pytest.raises(skills.SkillError, match="broken.md"):
            skills.parse("---\nname: x\n---\n", path)

    def test_every_packaged_skill_validates(self):
        for skill in skills.packaged():
            assert skill["summary"]
            assert isinstance(skill["always"], bool)
            assert isinstance(skill["tools"], list)

    def test_a_file_whose_name_disagrees_with_its_front_matter_fails_to_load(
        self, tmp_path, monkeypatch
    ):
        (tmp_path / "actual.md").write_text("---\nname: claimed\nsummary: s\n---\nbody")
        monkeypatch.setattr(skills, "SKILLS_DIR", tmp_path)

        with pytest.raises(skills.SkillError, match="claimed"):
            skills.packaged()


@pytest.fixture
def skill_tree(tmp_path, monkeypatch):
    """A small skills directory with one nested family, so discovery is tested
    against a known shape rather than whatever ships today."""
    (tmp_path / "top.md").write_text("---\nname: top\nsummary: Top level.\n---\n# Top\n")
    (tmp_path / "README.md").write_text("# not a skill\n")
    charts = tmp_path / "charts"
    charts.mkdir()
    (charts / "line.md").write_text(
        "---\nname: line\nsummary: Lines.\nfamily: line\ntools: [list_models, get_model]\n---\n# Line\n"
    )
    (charts / "bar.md").write_text(
        "---\nname: bar\nsummary: Bars.\ntools: [list_models]\n---\n# Bar\n"
    )
    monkeypatch.setattr(skills, "SKILLS_DIR", tmp_path)
    return tmp_path


class TestDiscovery:
    """VIS-1402: a subdirectory is a namespace, and the registry is queryable."""

    def test_subdirectories_are_discovered_and_namespaced(self, skill_tree):
        assert [s["name"] for s in skills.packaged()] == ["charts/bar", "charts/line", "top"]

    def test_the_readme_in_any_directory_is_skipped(self, skill_tree):
        (skill_tree / "charts" / "README.md").write_text("# nope\n")

        assert "charts/README" not in [s["name"] for s in skills.packaged()]

    def test_body_is_the_file_and_text_is_below_the_fence(self, skill_tree):
        line = next(s for s in skills.packaged() if s["name"] == "charts/line")

        assert line["body"].startswith("---\nname: line")
        assert line["text"] == "# Line\n"

    def test_index_is_name_summary_always(self, skill_tree):
        assert skills.index() == [
            ("charts/bar", "Bars.", False),
            ("charts/line", "Lines.", False),
            ("top", "Top level.", False),
        ]

    def test_body_by_registry_name(self, skill_tree):
        assert skills.body("charts/line").endswith("# Line\n")

    def test_an_unknown_name_lists_the_valid_ones(self, skill_tree):
        with pytest.raises(KeyError, match="charts/line"):
            skills.body("charts/pie")

    def test_attached_to_finds_every_skill_that_lists_the_tool(self, skill_tree):
        assert {s["name"] for s in skills.attached_to("list_models")} == {
            "charts/bar",
            "charts/line",
        }
        assert [s["name"] for s in skills.attached_to("get_model")] == ["charts/line"]
        assert skills.attached_to("write_chart") == []

    def test_shipped_names_are_unchanged(self):
        """Nothing today lives in a subdirectory, so every name is still a stem."""
        for skill in skills.packaged():
            assert "/" not in skill["name"]
