import os
import pytest
from tests.factories.model_factories import (
    ItemFactory,
    ProjectFactory,
    RowFactory,
)
from tests.support.utils import temp_folder
from visivo.commands.serve_phase import serve_phase
from visivo.commands.utils import create_file_database
from visivo.server.hot_reload_server import HotReloadServer


def get_test_port():
    """Get an available port for testing"""
    return HotReloadServer.find_available_port()


@pytest.fixture
def test_project():
    return ProjectFactory()


@pytest.fixture
def server_url():
    port = get_test_port()
    return f"http://localhost:{port}"


@pytest.fixture
def output_dir():
    return temp_folder()


@pytest.fixture
def setup_project_with_data(output_dir):
    project = ProjectFactory()

    create_file_database(url=project.sources[0].url(), output_dir=output_dir)

    return project


def test_serve_phase_creates_server(test_project, output_dir, server_url):
    os.makedirs(output_dir, exist_ok=True)

    server, _, _ = serve_phase(
        output_dir=output_dir,
        working_dir=".",
        default_source=None,
        dag_filter=None,
        threads=1,
        skip_compile=True,
        project=test_project,
        server_url=server_url,
    )
    assert server is not None


def test_serve_phase_handles_dbt_ignore_patterns(test_project, output_dir, server_url):
    os.makedirs(output_dir, exist_ok=True)

    test_project.dbt = type(
        "MockDbt",
        (),
        {
            "enabled": True,
            "get_output_file": lambda output_dir, working_dir, *args: "mock_dbt_file",
        },
    )()

    server, _, _ = serve_phase(
        output_dir=output_dir,
        working_dir=".",
        default_source=None,
        dag_filter=None,
        threads=1,
        skip_compile=True,
        project=test_project,
        server_url=server_url,
    )

    assert "mock_dbt_file" in server.ignore_patterns


def test_on_project_change_layout_only_edit_refreshes_served_project(
    test_project, output_dir, server_url, mocker
):
    """A layout-only edit produces no runnable DAG diff, but the served project
    must still refresh (VIS-806). Without it, publishing a dashboard reshape
    leaves the object managers on the stale published config once the draft
    cache clears — the canvas silently loses the just-published edit."""
    os.makedirs(output_dir, exist_ok=True)

    server, on_project_change, _ = serve_phase(
        output_dir=output_dir,
        working_dir=".",
        default_source=None,
        dag_filter=None,
        threads=1,
        skip_compile=True,
        project=test_project,
        server_url=server_url,
    )

    dashboard_name = test_project.dashboards[0].name
    baseline_rows = len(test_project.dashboards[0].rows)

    # The recompiled project differs only by an empty layout row — exactly the
    # shape the Build-mode "+ Add row" → Publish flow writes to YAML. The row
    # and its slots are UNNAMED (like canvas-created empty slots), so they add
    # no named DAG node and the runnable diff stays empty. Built fresh (not
    # model_copy) because Project memoizes its dag in a private attr that a
    # deep copy would carry over, hiding the added row.
    modified_project = ProjectFactory()
    modified_project.dashboards[0].rows = list(modified_project.dashboards[0].rows) + [
        RowFactory(name=None, items=[ItemFactory(name=None, chart=None)])
    ]
    mocker.patch("visivo.commands.serve_phase.compile_phase", return_value=modified_project)

    on_project_change()

    client = server.app.test_client()
    data = client.get("/api/dashboards/").get_json()
    served = next(d for d in data["dashboards"] if d["name"] == dashboard_name)
    assert len(served["config"]["rows"]) == baseline_rows + 1


def test_on_project_change_drops_drafts_and_emits_project_changed(
    test_project, output_dir, server_url, mocker
):
    """Q15 last-write-wins (VIS-808): a *genuine* external YAML change during a
    dirty Build session drops every draft and notifies the SPA via the
    `project_changed` socket event with drafts_dropped=True."""
    os.makedirs(output_dir, exist_ok=True)

    server, on_project_change, _ = serve_phase(
        output_dir=output_dir,
        working_dir=".",
        default_source=None,
        dag_filter=None,
        threads=1,
        skip_compile=True,
        project=test_project,
        server_url=server_url,
    )
    emit_spy = mocker.patch.object(server.socketio, "emit")
    client = server.app.test_client()

    # Dirty the session through the real save endpoint (draft cache only).
    dashboard_name = test_project.dashboards[0].name
    config = client.get(f"/api/dashboards/{dashboard_name}/").get_json()["config"]
    config["rows"] = list(config["rows"]) + [{"height": "medium", "items": [{"width": 4}]}]
    assert client.post(f"/api/dashboards/{dashboard_name}/", json=config).status_code == 200
    assert client.get("/api/commit/pending/").get_json()["count"] == 1

    # The recompiled project genuinely differs from the served one (an extra
    # row on disk) — this is the real external-edit case, so drafts drop.
    externally_edited = ProjectFactory()
    externally_edited.dashboards[0].rows = list(externally_edited.dashboards[0].rows) + [
        RowFactory(name=None, items=[ItemFactory(name=None, chart=None)])
    ]
    mocker.patch("visivo.commands.serve_phase.compile_phase", return_value=externally_edited)

    on_project_change()

    assert client.get("/api/commit/pending/").get_json()["count"] == 0
    emit_spy.assert_called_with("project_changed", {"drafts_dropped": True})


def test_on_project_change_noop_recompile_preserves_drafts(
    test_project, output_dir, server_url, mocker
):
    """A watcher event from a no-op save (touch / whitespace-only edit)
    recompiles to a project identical to the one being served. Drafts MUST be
    preserved — only a genuine external edit triggers last-write-wins. Before
    the fix, ANY recompile during a dirty session destroyed the drafts."""
    os.makedirs(output_dir, exist_ok=True)

    server, on_project_change, _ = serve_phase(
        output_dir=output_dir,
        working_dir=".",
        default_source=None,
        dag_filter=None,
        threads=1,
        skip_compile=True,
        project=test_project,
        server_url=server_url,
    )
    emit_spy = mocker.patch.object(server.socketio, "emit")
    client = server.app.test_client()

    # Dirty the session through the real save endpoint (draft cache only).
    dashboard_name = test_project.dashboards[0].name
    config = client.get(f"/api/dashboards/{dashboard_name}/").get_json()["config"]
    config["rows"] = list(config["rows"]) + [{"height": "medium", "items": [{"width": 4}]}]
    assert client.post(f"/api/dashboards/{dashboard_name}/", json=config).status_code == 200
    assert client.get("/api/commit/pending/").get_json()["count"] == 1

    # A fresh ProjectFactory serializes identically to the served project — the
    # exact shape of a no-op recompile.
    mocker.patch("visivo.commands.serve_phase.compile_phase", return_value=ProjectFactory())

    on_project_change()

    # Draft survives, and the SPA is told nothing was dropped (no banner).
    assert client.get("/api/commit/pending/").get_json()["count"] == 1
    emit_spy.assert_called_with("project_changed", {"drafts_dropped": False})


def test_on_project_change_clean_session_emits_without_dropping(
    test_project, output_dir, server_url, mocker
):
    """A recompile with no drafts in flight (e.g. right after a publish, which
    clears the caches itself) reports drafts_dropped=False — no banner."""
    os.makedirs(output_dir, exist_ok=True)

    server, on_project_change, _ = serve_phase(
        output_dir=output_dir,
        working_dir=".",
        default_source=None,
        dag_filter=None,
        threads=1,
        skip_compile=True,
        project=test_project,
        server_url=server_url,
    )
    emit_spy = mocker.patch.object(server.socketio, "emit")
    mocker.patch("visivo.commands.serve_phase.compile_phase", return_value=ProjectFactory())

    on_project_change()

    emit_spy.assert_called_with("project_changed", {"drafts_dropped": False})
