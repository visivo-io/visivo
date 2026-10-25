"""Running the agent against a project that lives in core (VIS-1366).

The point of the design is that NOTHING about the tools changes — so these
drive the real `call()` against a RemoteProject and assert the same outcomes a
local project gives. Core is faked at the HTTP boundary, because what is under
test is our adapter, not requests.
"""

import pytest

from visivo.agent import tools
from visivo.cloud_api import CloudApi
from visivo.agent.remote import (
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
    return RemoteProject(CloudApi("https://app.visivo.io", "tok", "p1", session=core)), core


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

    def test_validate_judges_a_filter_against_the_remote_inputs(self):
        """The input lives in core, so the filter check must look it up there."""
        project, _ = _project(
            {
                "inputs": [
                    _envelope("regions", {"type": "multi-select", "options": ["North", "South"]})
                ]
            }
        )
        config = {
            "name": "by_region",
            "props": {"type": "bar", "x": "?{ ${ref(sales).region} }"},
            "interactions": [{"filter": "?{ ${ref(sales).region} IN ${ref(regions).values} }"}],
        }

        result = call(project, "validate_insight", {"config": config})

        assert result["valid"] is False and "IN (${ref(regions).values})" in result["error"]

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

        with pytest.raises(ToolError, match="write_markdown failed: .*403"):
            call(project, "write_markdown", {"config": {"name": "x", "content": "#"}})


class TestReachingCoreFromInsideTheCluster:
    """A pod cannot reach its own cluster's external ingress, so the connection
    goes to the web Service's DNS name — which core's ALLOWED_HOSTS rejects
    with a 400 DisallowedHost, arriving as an HTML error page rather than
    anything an agent can read."""

    def test_the_public_name_is_sent_as_host(self):
        core = FakeCore()
        CloudApi(
            "http://core-web.core.svc.cluster.local",
            "tok",
            "p1",
            session=core,
            host_header="app.development.visivo.io",
        )

        assert core.headers["Host"] == "app.development.visivo.io"

    def test_and_the_proxy_proto_so_the_redirect_does_not_bounce_it(self):
        """core redirects http->https; without this a plain-HTTP in-cluster
        call is bounced to a URL the pod cannot reach."""
        core = FakeCore()
        CloudApi("http://x", "tok", "p1", session=core, host_header="app.visivo.io")

        assert core.headers["X-Forwarded-Proto"] == "https"

    def test_neither_is_sent_when_there_is_no_override(self):
        """Out of cluster the connection host IS the public name, and forcing a
        Host header would be a way to get it wrong."""
        core = FakeCore()
        CloudApi("https://app.visivo.io", "tok", "p1", session=core)

        assert "Host" not in core.headers
        assert "X-Forwarded-Proto" not in core.headers

    def test_build_passes_it_through(self):
        core = FakeCore()
        build("http://x", "tok", "p1", session=core, host_header="app.visivo.io")

        assert core.headers["Host"] == "app.visivo.io"


class TestTheClient:
    def test_it_authenticates_the_way_everything_else_does(self):
        core = FakeCore()
        CloudApi("https://app.visivo.io", "secret-token", "p1", session=core)

        assert core.headers["Authorization"] == "Api-Key secret-token"

    def test_the_project_is_scoped_on_every_call(self):
        """Core requires the project and 404s an account mismatch; forgetting
        it is a 400 that reads like a bug in the tool.

        Both builders, because core has two route shapes — the per-type
        endpoints take the project as a query parameter, the agent and run
        endpoints take it in the path — and a call that used the wrong one
        would reach the wrong project or none at all.
        """
        client = CloudApi("https://app.visivo.io", "t", "p1", session=FakeCore())

        assert client._typed("/api/models/") == ("https://app.visivo.io/api/models/?project_id=p1")
        assert client._scoped("/run/") == "https://app.visivo.io/api/projects/p1/run/"

    def test_no_route_is_written_outside_the_two_builders(self):
        """So the surface the CLI depends on can be read off one file, and a
        caller asks for an endpoint rather than spelling one.

        Checked against the parsed source rather than the text, so prose about
        the endpoints stays allowed and only a literal being BUILT fails.
        """
        import ast
        from pathlib import Path

        source = Path(__file__).parents[2] / "visivo" / "cloud_api.py"
        tree = ast.parse(source.read_text())
        klass = next(
            node
            for node in ast.walk(tree)
            if isinstance(node, ast.ClassDef) and node.name == "CloudApi"
        )
        docstrings = {
            ast.get_docstring(node, clean=False)
            for node in ast.walk(klass)
            if isinstance(node, (ast.ClassDef, ast.FunctionDef))
        }

        # No exemptions: the builders take a route from the table above them,
        # so not even they contain one.
        offenders = []
        for method in klass.body:
            if not isinstance(method, ast.FunctionDef):
                continue
            for node in ast.walk(method):
                # Any literal that looks like a path, not just "/api/" ones:
                # the project-scoped routes are tails like "/agent/captures/"
                # and an "/api/" check sails straight past them.
                if (
                    isinstance(node, ast.Constant)
                    and isinstance(node.value, str)
                    and node.value.startswith("/")
                    # A bare "/" is a separator, not a route (rstrip).
                    and len(node.value) > 1
                    and node.value not in docstrings
                ):
                    offenders.append(f"{method.name}: {node.value}")

        assert offenders == [], f"a route is spelled in a method instead of the table: {offenders}"

    def test_build_is_the_one_entry_point(self):
        project = build("https://app.visivo.io", "t", "p1", session=FakeCore())

        assert isinstance(project, RemoteProject)


class TestWritingInCloud:
    """A write in cloud goes THROUGH to core, which stages it and requests the
    auto-run on its side. There is no local staging to do.

    Observed in a cloud turn: `write_insight failed: 'RemoteProject' object has
    no attribute 'staged_manager'` — raised AFTER the save had reached core, so
    the tool reported failure for a write that had landed, the model retried,
    and the object was written twice.
    """

    def _cloud_project(self):
        core = FakeCore({"models": []})
        return RemoteProject(CloudApi("https://core", "tok", "p1", session=core)), core

    def test_a_write_reaches_core_and_reports_success(self):
        project, core = self._cloud_project()

        result = tools.call(
            project,
            "write_model",
            {"config": {"name": "notes", "sql": "select 1 as x"}},
        )

        assert result["name"] == "notes"
        assert [(type_key, name) for type_key, name, _ in core.saved] == [("models", "notes")]

    def test_it_does_not_report_a_local_change(self):
        """`change` says what the LOCAL staging did. In cloud that is core's
        answer to give, and inventing one here would put the top bar into a
        state this process cannot see."""
        project, _core = self._cloud_project()

        result = tools.call(
            project,
            "write_model",
            {"config": {"name": "notes", "sql": "select 1 as x"}},
        )

        assert "change" not in result

    def test_a_local_write_still_stages(self, integration_app):
        """The guard must not switch local staging off — without it an agent's
        writes leave the top bar on Deploy and never trigger a run."""
        assert getattr(integration_app, "staged_manager", None) is not None

        result = tools.call(
            integration_app,
            "write_model",
            {"config": {"name": "staged_notes", "sql": "select 1 as x"}},
        )

        assert result["name"] == "staged_notes"
