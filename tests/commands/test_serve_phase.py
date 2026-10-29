import json
import os
from types import SimpleNamespace

import pytest
from tests.factories.model_factories import (
    ItemFactory,
    ProjectFactory,
    DefaultsFactory,
    RowFactory,
    SourceFactory,
    SqlModelFactory,
    ThemeFactory,
)
from tests.support.utils import temp_folder
from visivo.agent.actions import log
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
    emit_spy.assert_called_with(
        "project_changed",
        {"drafts_dropped": True, "dropped_drafts": [{"type": "dashboard", "name": dashboard_name}]},
    )


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
    emit_spy.assert_called_with("project_changed", {"drafts_dropped": False, "dropped_drafts": []})


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

    emit_spy.assert_called_with("project_changed", {"drafts_dropped": False, "dropped_drafts": []})


def _project_with_models(
    orders_sql="select * from test_table", database="tmp/test.sqlite", defaults=None
):
    return ProjectFactory(
        sources=[SourceFactory(database=database)],
        models=[
            SqlModelFactory(name="orders", sql=orders_sql),
            SqlModelFactory(name="customers"),
        ],
        defaults=defaults,
    )


def _serve(project, output_dir, server_url, working_dir="."):
    os.makedirs(output_dir, exist_ok=True)
    return serve_phase(
        output_dir=output_dir,
        working_dir=working_dir,
        default_source=None,
        dag_filter=None,
        threads=1,
        skip_compile=True,
        project=project,
        server_url=server_url,
    )


def _skip_run(mocker):
    return mocker.patch(
        "visivo.commands.serve_phase.run_phase",
        side_effect=lambda **kwargs: SimpleNamespace(
            project=kwargs["project"], failed_job_results=[]
        ),
    )


def _draft(client, collection, name, **changes):
    config = client.get(f"/api/{collection}/{name}/").get_json()["config"]
    config.update(changes)
    assert client.post(f"/api/{collection}/{name}/", json=config).status_code == 200


def _pending(client):
    return {
        (p["type"], p["name"]) for p in client.get("/api/commit/pending/").get_json()["pending"]
    }


def _recompile_to(mocker, on_project_change, project):
    mocker.patch("visivo.commands.serve_phase.compile_phase", return_value=project)
    _skip_run(mocker)
    on_project_change()


def test_a_hand_edit_to_a_drafted_model_drops_only_that_draft(output_dir, server_url, mocker):
    """VIS-1562. A hand edit to a drafted model kept the draft, and the next
    commit overwrote the edit. Drafts of other objects are not in conflict."""
    server, on_project_change, _ = _serve(_project_with_models(), output_dir, server_url)
    emit_spy = mocker.patch.object(server.socketio, "emit")
    client = server.app.test_client()
    _draft(client, "models", "orders", sql="select 1 as draft_column")
    _draft(client, "models", "customers", sql="select 2 as draft_column")

    hand_edited = _project_with_models(orders_sql="select * from test_table where hand_edit = 1")
    _recompile_to(mocker, on_project_change, hand_edited)

    assert _pending(client) == {("model", "customers")}
    emit_spy.assert_called_with(
        "project_changed",
        {"drafts_dropped": True, "dropped_drafts": [{"type": "model", "name": "orders"}]},
    )
    served = client.get("/api/models/orders/").get_json()["config"]
    assert served["sql"] == "select * from test_table where hand_edit = 1"


def test_a_hand_edit_to_a_drafted_source_drops_only_that_draft(output_dir, server_url, mocker):
    server, on_project_change, _ = _serve(_project_with_models(), output_dir, server_url)
    emit_spy = mocker.patch.object(server.socketio, "emit")
    client = server.app.test_client()
    _draft(client, "sources", "source", database="tmp/draft.sqlite")
    _draft(client, "models", "orders", sql="select 1 as draft_column")

    _recompile_to(
        mocker, on_project_change, _project_with_models(database="tmp/hand_edited.sqlite")
    )

    assert _pending(client) == {("model", "orders")}
    emit_spy.assert_called_with(
        "project_changed",
        {"drafts_dropped": True, "dropped_drafts": [{"type": "source", "name": "source"}]},
    )


def test_a_noop_recompile_preserves_a_model_draft(output_dir, server_url, mocker):
    server, on_project_change, _ = _serve(_project_with_models(), output_dir, server_url)
    emit_spy = mocker.patch.object(server.socketio, "emit")
    client = server.app.test_client()
    _draft(client, "models", "orders", sql="select 1 as draft_column")

    mocker.patch("visivo.commands.serve_phase.compile_phase", return_value=_project_with_models())
    on_project_change()

    assert _pending(client) == {("model", "orders")}
    emit_spy.assert_called_with("project_changed", {"drafts_dropped": False, "dropped_drafts": []})


def test_a_defaults_draft_drops_only_when_the_file_changes_defaults(output_dir, server_url, mocker):
    project = _project_with_models(defaults=DefaultsFactory())
    server, on_project_change, _ = _serve(project, output_dir, server_url)
    emit_spy = mocker.patch.object(server.socketio, "emit")
    client = server.app.test_client()
    assert (
        client.post("/api/defaults/", json={"source_name": "source", "threads": 4}).status_code
        == 200
    )

    _recompile_to(
        mocker,
        on_project_change,
        _project_with_models(orders_sql="select 2", defaults=DefaultsFactory()),
    )
    assert _pending(client) == {("defaults", "defaults")}

    _recompile_to(
        mocker,
        on_project_change,
        _project_with_models(defaults=DefaultsFactory(threads=2)),
    )
    assert _pending(client) == set()
    emit_spy.assert_called_with(
        "project_changed",
        {"drafts_dropped": True, "dropped_drafts": [{"type": "defaults", "name": "defaults"}]},
    )


def test_a_theme_draft_drops_when_the_file_changes_the_theme(output_dir, server_url, mocker):
    server, on_project_change, _ = _serve(_project_with_models(), output_dir, server_url)
    emit_spy = mocker.patch.object(server.socketio, "emit")
    client = server.app.test_client()
    project = _project_with_models()
    project.theme = ThemeFactory()
    assert client.post("/api/theme/", json={"mode": "light"}).status_code == 200

    _recompile_to(mocker, on_project_change, project)

    assert _pending(client) == set()
    emit_spy.assert_called_with(
        "project_changed",
        {"drafts_dropped": True, "dropped_drafts": [{"type": "theme", "name": "theme"}]},
    )


PROJECT_YAML = """name: hand-edit-project
sources:
  - name: source
    type: sqlite
    database: tmp/test.sqlite
models:
  - name: orders
    sql: {orders_sql}
    source: ref(source)
  - name: customers
    sql: select * from customers
    source: ref(source)
dashboards:
  - name: dashboard
    rows:
      - items:
          - markdown: hello
"""


def test_commit_after_a_hand_edit_keeps_the_edit_and_writes_the_other_draft(
    output_dir, server_url, mocker
):
    """VIS-1562 end to end: draft two models, hand-edit one of them in the YAML
    while serve runs, then commit. The file keeps the hand edit and gains the
    draft of the model nobody edited by hand."""
    from visivo.commands.compile_phase import compile_phase

    working_dir = temp_folder()
    os.makedirs(working_dir, exist_ok=True)
    project_file = os.path.join(working_dir, "project.visivo.yml")
    with open(project_file, "w") as f:
        f.write(PROJECT_YAML.format(orders_sql="select * from test_table"))
    project = compile_phase(default_source=None, working_dir=working_dir, output_dir=output_dir)

    server, on_project_change, _ = _serve(project, output_dir, server_url, working_dir)
    client = server.app.test_client()
    _draft(client, "models", "orders", sql="select 1 as orders_draft")
    _draft(client, "models", "customers", sql="select 2 as customers_draft")

    with open(project_file, "w") as f:
        f.write(PROJECT_YAML.format(orders_sql="select * from test_table where hand_edit = 1"))
    _skip_run(mocker)
    on_project_change()

    assert client.post("/api/commit/").status_code == 200

    with open(project_file) as f:
        on_disk = f.read()
    assert "where hand_edit = 1" in on_disk
    assert "orders_draft" not in on_disk
    assert "customers_draft" in on_disk


def test_a_recorded_agent_action_is_pushed_over_the_socket(
    test_project, output_dir, server_url, mocker
):
    """VIS-1337. The recording layer has no socket; serve is what gives it one,
    so this is the only place the two halves meet."""
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
    emit = mocker.patch.object(server.socketio, "emit")

    action = log().record("write_model", obj={"type": "model", "name": "orders"})

    emit.assert_called_once_with("agent_action", {"id": action["id"]})


def test_the_push_carries_no_payload_beyond_the_signal(
    test_project, output_dir, server_url, mocker
):
    """The viewer refetches the log on this event, so sending the action itself
    would be a second copy free to disagree with the one it reads."""
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
    emit = mocker.patch.object(server.socketio, "emit")

    log().record("write_model", obj={"type": "model", "name": "orders"})

    _, payload = emit.call_args.args
    assert set(payload) == {"id"}


def test_a_failed_recompile_writes_the_stacktrace_when_asked(
    test_project, output_dir, server_url, mocker, monkeypatch
):
    _, on_project_change, _ = _serve(test_project, output_dir, server_url)
    monkeypatch.setenv("STACKTRACE", "true")
    mocker.patch("visivo.commands.serve_phase.compile_phase", side_effect=ValueError("bad yaml"))

    on_project_change()

    with open(f"{output_dir}/error.json") as f:
        message = json.load(f)["message"]
    assert message.startswith("bad yaml\nTraceback")


def test_a_browser_that_will_not_open_is_logged_not_raised(
    test_project, output_dir, server_url, mocker, monkeypatch
):
    os.makedirs(output_dir, exist_ok=True)
    _, _, on_server_ready = serve_phase(
        output_dir=output_dir,
        working_dir=".",
        default_source=None,
        dag_filter=None,
        threads=1,
        skip_compile=True,
        project=test_project,
        server_url=server_url,
        new=True,
    )
    monkeypatch.setenv("STACKTRACE", "true")
    _skip_run(mocker)
    mocker.patch("visivo.commands.serve_phase.webbrowser.open", side_effect=OSError("no browser"))
    error = mocker.patch("visivo.commands.serve_phase.Logger.instance").return_value.error

    on_server_ready()

    assert error.call_args[0][0].startswith("no browser\nTraceback")
