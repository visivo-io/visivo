"""The tool registry (VIS-1333).

Two properties carry the weight, and both are about what an agent CANNOT do.
A registry that lists tools by hand drifts from the object model the moment
someone adds a type; a registry whose writes reach the filesystem makes an
autonomous loop something you cannot safely ship.
"""

import os

import pytest

from visivo.agent.tools import SPECIAL_TOOL_NAMES, TOOLS, ToolError, call, tool_names
from visivo.server.rename_service import TYPE_TO_MANAGER


class TestItIsARegistryNotAList:
    """Adding a Visivo object type must require no change to tools.py."""

    def test_every_type_gets_every_verb(self):
        for type_key in TYPE_TO_MANAGER:
            singular = type_key[:-1]
            for expected in (
                f"list_{type_key}",
                f"get_{singular}",
                f"write_{singular}",
                f"validate_{singular}",
            ):
                assert expected in TOOLS, expected

    def test_it_covers_the_type_map_and_nothing_it_invented(self):
        """The map is the source; a tool for a type that is not in it would be
        a hand-written one that nothing keeps in step."""
        typed = {
            n for n in tool_names() if not n.startswith("list_") and n not in SPECIAL_TOOL_NAMES
        }
        singulars = {k[:-1] for k in TYPE_TO_MANAGER}

        for name in typed:
            assert name.split("_", 1)[1] in singulars, name

    def test_a_new_type_needs_no_edit_here(self, monkeypatch):
        """The real test of the claim: add a type to the map, rebuild, and the
        four tools exist without touching this module."""
        from visivo.agent import tools as tools_module

        monkeypatch.setitem(TYPE_TO_MANAGER, "widgets", "widget_manager")
        rebuilt = tools_module._generated_tools()

        assert {"list_widgets", "get_widget", "write_widget", "validate_widget"} <= set(rebuilt)


class TestSourceCredentials:
    def test_writing_back_a_read_source_does_not_stage_the_mask(
        self, integration_app, output_dir, monkeypatch
    ):
        """`get_source` serves the masked password; writing that config back
        must keep the real credential, not commit `**********`."""
        monkeypatch.setenv("AGENT_DB_PASSWORD", "unset")
        monkeypatch.delenv("AGENT_DB_PASSWORD")
        config = {
            "name": "agent-db",
            "type": "postgresql",
            "host": "localhost",
            "database": "analytics",
            "username": "svc",
            "password": "hunter2",
        }
        call(integration_app, "write_source", {"config": config})

        echoed = call(integration_app, "get_source", {"name": "agent-db"})
        echoed["host"] = "db.internal"
        call(integration_app, "write_source", {"config": echoed})

        cached = integration_app.source_manager.cached_objects["agent-db"]
        assert cached.model_dump(mode="json")["password"] == "${env.AGENT_DB_PASSWORD}"
        assert os.environ["AGENT_DB_PASSWORD"] == "hunter2"
        with open(os.path.join(output_dir, ".env")) as env_file:
            assert "AGENT_DB_PASSWORD" in env_file.read()


class TestNothingReachesTheFilesystem:
    """Every write lands in the draft tier. `commit` is deliberately absent —
    promotion stays a human action, and turning drafts into files is
    ProjectWriter's job at commit time."""

    def test_there_is_no_commit_tool(self):
        assert not [n for n in tool_names() if "commit" in n]

    def test_nor_any_tool_that_writes_or_runs_the_project(self):
        forbidden = ("write_file", "delete_file", "deploy", "dist", "serve")
        assert not [n for n in tool_names() if any(f in n for f in forbidden)]

    def test_a_write_lands_in_the_draft_tier(self, integration_app):
        call(
            integration_app,
            "write_markdown",
            {"config": {"name": "agent-note", "content": "# hello"}},
        )

        assert "agent-note" in integration_app.markdown_manager.cached_objects

    def test_and_leaves_the_project_file_untouched(self, integration_app, output_dir):
        """Byte-identical: an agent edit is a draft, and a draft is not a file."""
        before = _project_files(output_dir)

        call(
            integration_app,
            "write_markdown",
            {"config": {"name": "agent-note", "content": "# hello"}},
        )

        assert _project_files(output_dir) == before

    def test_a_project_file_written_in_a_sibling_folder_is_not_ours(self, output_dir):
        """Parallel test workers share the parent temp directory."""
        before = _project_files(output_dir)
        sibling = os.path.join(os.path.dirname(os.path.abspath(output_dir)), "sibling-worker")
        os.makedirs(sibling, exist_ok=True)
        stray = os.path.join(sibling, "project.visivo.yml")
        try:
            with open(stray, "w") as handle:
                handle.write("name: other\n")

            assert _project_files(output_dir) == before
        finally:
            os.remove(stray)
            os.rmdir(sibling)


class TestReading:
    def test_list_returns_the_published_objects(self, integration_app):
        listed = call(integration_app, "list_sources", {})

        assert [s["name"] for s in listed] == [
            s.name for s in integration_app.source_manager.get_all_objects_list()
        ]

    def test_get_reads_one_by_name(self, integration_app):
        source = integration_app.source_manager.get_all_objects_list()[0]

        assert call(integration_app, "get_source", {"name": source.name})["name"] == source.name

    def test_a_name_that_does_not_exist_says_so(self, integration_app):
        with pytest.raises(ToolError, match="No source named 'nope'"):
            call(integration_app, "get_source", {"name": "nope"})

    def test_a_written_draft_reads_back(self, integration_app):
        """An agent should see its own edit, the way the editor does."""
        call(
            integration_app,
            "write_markdown",
            {"config": {"name": "agent-note", "content": "# hello"}},
        )

        assert call(integration_app, "get_markdown", {"name": "agent-note"})["content"] == "# hello"


class TestValidating:
    def test_a_good_config_validates_without_saving(self, integration_app):
        result = call(
            integration_app,
            "validate_markdown",
            {"config": {"name": "unsaved", "content": "# hi"}},
        )

        assert result == {"valid": True}
        assert "unsaved" not in integration_app.markdown_manager.cached_objects

    def test_a_bad_one_reports_rather_than_raises(self, integration_app):
        """The agent can act on a reason; it cannot act on a traceback."""
        result = call(integration_app, "validate_markdown", {"config": {"name": "bad"}})

        assert result["valid"] is False
        assert result["error"]

    def test_write_refuses_a_config_that_does_not_validate(self, integration_app):
        with pytest.raises(ToolError, match="Invalid markdown"):
            call(integration_app, "write_markdown", {"config": {"name": "bad"}})

        assert "bad" not in integration_app.markdown_manager.cached_objects

    def test_write_refuses_a_config_with_no_name(self, integration_app):
        with pytest.raises(ToolError, match="must carry a 'name'"):
            call(integration_app, "write_markdown", {"config": {"content": "# hi"}})


class TestNamesAreUniqueAcrossTypes:
    """In eval rounds b14, b16 and b17 the agent named each chart after the
    insight it wraps. The draft tier took both, every ref to the name became
    ambiguous, the background run failed, and the dashboard's charts spun
    forever while the agent called it ready."""

    INSIGHT = {"name": "trips_by_day", "props": {"type": "bar", "x": "?{ 1 }", "y": "?{ 2 }"}}
    CHART = {"name": "trips_by_day", "insights": ["${ref(trips_by_day)}"]}

    def test_a_chart_named_after_its_insight_is_refused(self, integration_app):
        call(integration_app, "write_insight", {"config": self.INSIGHT})

        with pytest.raises(ToolError, match="already the name of an insight") as raised:
            call(integration_app, "write_chart", {"config": self.CHART})

        assert "'trips_by_day_chart'" in str(raised.value)
        assert "trips_by_day" not in integration_app.chart_manager.cached_objects

    def test_validate_reports_the_clash(self, integration_app):
        call(integration_app, "write_insight", {"config": self.INSIGHT})

        result = call(integration_app, "validate_chart", {"config": self.CHART})

        assert result["valid"] is False and "names are unique" in result["error"].lower()

    def test_a_chart_name_held_by_a_markdown_reads_with_a(self, integration_app):
        call(integration_app, "write_markdown", {"config": {"name": "notes", "content": "# hi"}})
        chart = {"name": "notes", "insights": []}
        with pytest.raises(ToolError, match="already the name of a markdown"):
            call(integration_app, "write_chart", {"config": chart})

    def test_rewriting_the_same_object_and_a_fresh_name_pass(self, integration_app):
        call(integration_app, "write_insight", {"config": self.INSIGHT})
        assert call(integration_app, "write_insight", {"config": self.INSIGHT})["status"] == "draft"

        chart = {"name": "trips_by_day_chart", "insights": ["${ref(trips_by_day)}"]}
        assert call(integration_app, "write_chart", {"config": chart})["status"] == "draft"
        assert call(integration_app, "validate_chart", {"config": chart}) == {"valid": True}


class TestTheCallingContract:
    def test_an_unknown_tool_is_a_reason_not_a_crash(self, integration_app):
        with pytest.raises(ToolError, match="No tool named 'fly'"):
            call(integration_app, "fly", {})

    def test_a_missing_required_argument_is_too(self, integration_app):
        with pytest.raises(ToolError, match="'name' is required"):
            call(integration_app, "get_source", {})

    def test_every_tool_advertises_a_schema_and_a_description(self):
        for tool in TOOLS.values():
            assert tool.description.strip()
            assert tool.input_schema["type"] == "object"
            for required in tool.input_schema.get("required", []):
                assert required in tool.input_schema["properties"], tool.name


def _project_files(output_dir):
    """Every project file and its bytes under the test's own folder, for a
    byte-identical comparison. Never its parent: that temp directory is shared
    with other test processes."""
    found = {}
    for directory, _, names in os.walk(os.path.abspath(output_dir)):
        for name in names:
            if name.endswith((".visivo.yml", ".visivo.yaml")):
                path = os.path.join(directory, name)
                with open(path, "rb") as handle:
                    found[path] = handle.read()
    return found


class TestAWriteStagesAndRuns:
    """A person's edit reaches staging and the run trigger through the
    ``after_request`` hook on ``POST /api/<type>/<name>/``. The agent saves
    in-process, so it never passed through a request — its writes staged
    nothing (leaving the top bar offering Deploy rather than Commit) and never
    triggered a run, however ``run_trigger`` was set.
    """

    def _staged_names(self, app):
        records = app.staged_manager.list() if hasattr(app.staged_manager, "list") else []
        return {getattr(r, "name", r.get("name") if isinstance(r, dict) else None) for r in records}

    def test_a_write_is_staged(self, integration_app):
        call(
            integration_app,
            "write_model",
            {"config": {"name": "agent-staged", "sql": "select 1 as n"}},
        )

        assert "agent-staged" in self._staged_names(integration_app)

    def test_a_presentation_only_write_stages_nothing(self, integration_app):
        """The staged set is what a RUN would build, not what a COMMIT would
        publish. A markdown moves no data, so it belongs in neither."""
        result = call(
            integration_app,
            "write_markdown",
            {"config": {"name": "agent-note-only", "content": "# hi"}},
        )

        assert "change" not in result
        assert "agent-note-only" not in self._staged_names(integration_app)

    def test_an_automatic_trigger_requests_a_run(self, integration_app, monkeypatch):
        import visivo.server.views.run_views as run_views

        requested = []
        monkeypatch.setattr(run_views, "get_run_trigger", lambda: run_views.AUTOMATIC)
        monkeypatch.setattr(
            run_views, "request_run", lambda app, names: requested.append(list(names))
        )

        result = call(
            integration_app,
            "write_model",
            {"config": {"name": "agent-model", "sql": "select 1 as n"}},
        )

        assert requested == [["agent-model"]]
        assert result["change"] == "ran"

    def test_a_manual_trigger_stages_without_running(self, integration_app, monkeypatch):
        """The staged set still has to be recorded — it is what the Run view
        lists and what offers Commit — but nothing runs until asked."""
        import visivo.server.views.run_views as run_views

        requested = []
        monkeypatch.setattr(run_views, "get_run_trigger", lambda: "manual")
        monkeypatch.setattr(
            run_views, "request_run", lambda app, names: requested.append(list(names))
        )

        result = call(
            integration_app,
            "write_model",
            {"config": {"name": "agent-manual", "sql": "select 1 as n"}},
        )

        assert requested == []
        assert result["change"] == "staged"
        assert "agent-manual" in self._staged_names(integration_app)


class TestEveryFailureIsARefusal:
    def _with_handler(self, monkeypatch, name, handler):
        from visivo.agent import tools

        broken = tools.Tool(name=name, description="", input_schema={}, handler=handler)
        monkeypatch.setitem(tools.TOOLS, name, broken)

    def test_an_unexpected_error_names_the_tool(self, integration_app, monkeypatch):
        def boom(app, arguments):
            raise RuntimeError("driver exploded")

        self._with_handler(monkeypatch, "get_theme", boom)

        with pytest.raises(ToolError, match="^get_theme failed: driver exploded$"):
            call(integration_app, "get_theme", {})

    def test_and_the_source_it_ran_against(self, integration_app, monkeypatch):
        def boom(app, arguments):
            raise RuntimeError("no such column")

        self._with_handler(monkeypatch, "query_source", boom)

        with pytest.raises(ToolError, match="^query_source failed on 'wh': no such column$"):
            call(integration_app, "query_source", {"source": "wh", "sql": "select 1"})

    def test_a_timeout_is_passed_through_as_its_own_message(self, integration_app, monkeypatch):
        from visivo.jobs.run_model_data_job import QueryTimeout

        def slow(app, arguments):
            raise QueryTimeout("Query did not return within 20s.")

        self._with_handler(monkeypatch, "query_source", slow)

        with pytest.raises(ToolError, match="^Query did not return within 20s.$"):
            call(integration_app, "query_source", {"source": "wh", "sql": "select 1"})

    def test_a_refusal_is_raised_unchanged(self, integration_app, monkeypatch):
        refusal = ToolError("no")

        def refuse(app, arguments):
            raise refusal

        self._with_handler(monkeypatch, "get_theme", refuse)

        with pytest.raises(ToolError) as raised:
            call(integration_app, "get_theme", {})
        assert raised.value is refusal
