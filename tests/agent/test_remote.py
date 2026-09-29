"""Running the agent against a project that lives in core (VIS-1366).

The point of the design is that NOTHING about the tools changes — so these
drive the real `call()` against a RemoteProject and assert the same outcomes a
local project gives. Core is faked at the HTTP boundary, because what is under
test is our adapter, not requests.
"""

import pytest

from visivo.agent.remote import (
    CoreClient,
    RemoteProject,
    RemoteProjectError,
    build,
)
from visivo.agent.tools import ToolError, call


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def json(self):
        return self._payload


class FakeCore:
    """Core's per-type endpoints, in memory. Records what was written so a
    test can assert the agent's drafts actually reached it."""

    def __init__(self, rows=None):
        self.rows = rows or {}
        self.saved = []
        self.headers = {}

    def get(self, url, timeout=None):
        if "/run/" in url:
            return FakeResponse(self.rows.get("runs", []))
        type_key = url.split("/api/")[1].split("/")[0]
        return FakeResponse({type_key: self.rows.get(type_key, [])})

    def post(self, url, json=None, timeout=None):
        parts = url.split("/api/")[1].split("?")[0].strip("/").split("/")
        type_key, name = parts[0], parts[1]
        self.saved.append((type_key, name, json))
        return FakeResponse({"name": name, "status": "new", "config": json}, 201)


def _envelope(name, config, status="published"):
    return {"id": name, "name": name, "status": status, "config": config, "child_item_names": []}


def _project(rows=None, core=None):
    core = core or FakeCore(rows)
    return RemoteProject(CoreClient("https://app.visivo.io", "tok", "p1", session=core)), core


class TestItLooksLikeAProject:
    def test_every_type_has_a_manager_where_the_tools_look(self):
        """`tools._manager` does getattr(app, "<singular>_manager"). A type
        without one is a tool that raises on a project that has that type."""
        project, _ = _project()

        from visivo.server.rename_service import TYPE_TO_MANAGER

        for attribute in TYPE_TO_MANAGER.values():
            assert hasattr(project, attribute), attribute

    def test_published_rows_land_in_the_published_tier(self):
        project, _ = _project({"markdowns": [_envelope("notes", {"content": "# hi"})]})

        assert "notes" in project.markdown_manager.published_objects
        assert "notes" not in project.markdown_manager.cached_objects

    def test_draft_rows_land_in_the_draft_tier(self):
        """The two tiers survive the trip, so get_status keeps meaning what it
        means locally."""
        project, _ = _project({"markdowns": [_envelope("wip", {"content": "# wip"}, status="new")]})

        assert "wip" in project.markdown_manager.cached_objects

    def test_a_row_this_visivo_cannot_parse_is_skipped_not_fatal(self):
        """A newer field, or something written by another version. Losing the
        session over one object the agent was not asked about is worse than
        working with the rest."""
        project, _ = _project(
            {
                "markdowns": [
                    _envelope("good", {"content": "# ok"}),
                    _envelope("bad", {"content": "# x", "not_a_field": True}),
                ]
            }
        )

        assert "good" in project.markdown_manager.published_objects
        assert "bad" not in project.markdown_manager.published_objects


class TestTheToolsWorkUnchanged:
    def test_list_reads_the_remote_project(self):
        project, _ = _project({"markdowns": [_envelope("notes", {"content": "# hi"})]})

        [found] = call(project, "list_markdowns", {})

        assert found["name"] == "notes"

    def test_get_reads_one(self):
        project, _ = _project({"markdowns": [_envelope("notes", {"content": "# hi"})]})

        assert call(project, "get_markdown", {"name": "notes"})["content"] == "# hi"

    def test_a_missing_object_refuses_the_same_way(self):
        project, _ = _project()

        with pytest.raises(ToolError):
            call(project, "get_markdown", {"name": "nope"})

    def test_validate_needs_no_network_at_all(self):
        """Validation is Pydantic. A project that cannot be reached should
        still be able to tell an agent its config is wrong."""
        project, core = _project()

        result = call(project, "validate_markdown", {"config": {"name": "x", "content": "#"}})

        assert result["valid"] is True
        assert core.saved == []

    def test_a_write_reaches_core_as_a_draft(self):
        project, core = _project()

        call(project, "write_markdown", {"config": {"name": "fresh", "content": "# new"}})

        [(type_key, name, config)] = core.saved
        assert (type_key, name) == ("markdowns", "fresh")
        assert config["content"] == "# new"

    def test_and_is_visible_to_the_next_tool_call(self):
        """Write-through must not mean write-only: the agent reads back what it
        just wrote, in the same turn."""
        project, _ = _project()

        call(project, "write_markdown", {"config": {"name": "fresh", "content": "# new"}})

        assert call(project, "get_markdown", {"name": "fresh"})["content"] == "# new"

    def test_get_schema_needs_no_project_at_all(self):
        project, core = _project()

        assert call(project, "get_schema", {"type": "markdowns"})
        assert core.saved == []


class TestRuns:
    def test_list_runs_reads_cores_runs(self):
        project, _ = _project({"runs": [{"id": "r1", "state": "failed"}]})

        result = call(project, "list_runs", {})

        assert result["latest"]["id"] == "r1"

    def test_get_run_returns_the_log_core_has(self):
        project, _ = _project(
            {"runs": [{"id": "r1", "state": "failed", "logs": "Binder Error: no column"}]}
        )

        assert "Binder Error" in call(project, "get_run", {"run_id": "r1"})["logs"]


class TestWhenCoreWillNotAnswer:
    def test_a_failed_read_is_explained_not_silently_empty(self):
        """An empty project and an unreachable one look identical to an agent,
        and it would happily 'fix' the emptiness by rebuilding everything."""

        class Refusing(FakeCore):
            def get(self, url, timeout=None):
                return FakeResponse({}, status_code=503)

        with pytest.raises(RemoteProjectError) as refused:
            _project(core=Refusing())

        assert "503" in str(refused.value)

    def test_the_message_carries_enough_to_diagnose(self):
        """ "Could not read sources from core (400)" gives a status and nothing
        about which request produced it. The interesting part of a 400 is the
        URL and what the server said — and this message is the only thing that
        reaches whoever is looking at the Agent tab."""

        class Complaining(FakeCore):
            def get(self, url, timeout=None):
                return FakeResponse({"error": "project_id is required param"}, 400)

        with pytest.raises(RemoteProjectError) as refused:
            _project(core=Complaining())

        message = str(refused.value)
        assert "/api/sources/" in message, "which endpoint"
        assert "project_id=" in message, "what was actually sent"
        assert "project_id is required param" in message, "what core said about it"

    def test_a_failed_write_is_not_reported_as_success(self):
        class Rejecting(FakeCore):
            def post(self, url, json=None, timeout=None):
                return FakeResponse({"error": "nope"}, status_code=403)

        project, _ = _project(core=Rejecting())

        with pytest.raises(RemoteProjectError):
            call(project, "write_markdown", {"config": {"name": "x", "content": "#"}})


class TestTheClient:
    def test_it_authenticates_the_way_everything_else_does(self):
        core = FakeCore()
        CoreClient("https://app.visivo.io", "secret-token", "p1", session=core)

        assert core.headers["Authorization"] == "Api-Key secret-token"

    def test_the_project_is_scoped_on_every_call(self):
        """Core requires project_id and 404s an account mismatch; forgetting it
        is a 400 that reads like a bug in the tool."""
        client = CoreClient("https://app.visivo.io", "t", "p1", session=FakeCore())

        assert client._url("/api/models/").endswith("?project_id=p1")

    def test_build_is_the_one_entry_point(self):
        project = build("https://app.visivo.io", "t", "p1", session=FakeCore())

        assert isinstance(project, RemoteProject)
