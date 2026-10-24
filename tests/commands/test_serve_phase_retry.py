import sqlite3

import pytest

from tests.factories.model_factories import ProjectFactory, SqlModelFactory
from visivo.commands.parse_project_phase import parse_project_phase
from visivo.commands.serve_phase import _retry_filter, _unbuilt_names, serve_phase
from visivo.output_paths import run_dir, schema_file
from visivo.server.hot_reload_server import HotReloadServer
from visivo.server.managers.run_manager import RunManager

PROJECT_YAML = """name: p
sources:
  - name: s
    type: sqlite
    database: {db}
models:
  - name: m
    sql: SELECT * FROM {table}
    source: ${{ref(s)}}
insights:
  - name: i
    props:
      type: bar
      x: ?{{ ${{ref(m).quarter}} }}
      y: ?{{ ${{ref(m).units_sold}} }}
charts:
  - name: c
    layout:
      title:
        text: {title}
    insights:
      - ${{ref(i)}}
dashboards:
  - name: d
    rows:
      - items:
          - chart: ${{ref(c)}}
"""


@pytest.fixture(autouse=True)
def fresh_run_manager():
    RunManager._instance = None
    yield
    RunManager._instance = None


@pytest.fixture
def workspace(tmp_path):
    db = tmp_path / "local.db"
    sqlite3.connect(db).close()
    return tmp_path


def _create_sales_table(workspace):
    connection = sqlite3.connect(workspace / "local.db")
    connection.execute("create table ev_sales(quarter text, units_sold int)")
    connection.execute("insert into ev_sales values ('Q1', 10), ('Q2', 20)")
    connection.commit()
    connection.close()


def _write_project(workspace, table="ev_sales", title="Sales"):
    (workspace / "project.visivo.yml").write_text(
        PROJECT_YAML.format(db=workspace / "local.db", table=table, title=title)
    )


def _serve(workspace, **overrides):
    output_dir = str(workspace / "target")
    project = parse_project_phase(
        working_dir=str(workspace),
        output_dir=output_dir,
        default_source=None,
        dbt_profile=None,
        dbt_target=None,
    )
    kwargs = dict(
        output_dir=output_dir,
        working_dir=str(workspace),
        default_source=None,
        dag_filter=None,
        threads=1,
        skip_compile=False,
        project=project,
        server_url=f"http://localhost:{HotReloadServer.find_available_port()}",
    )
    kwargs.update(overrides)
    return serve_phase(**kwargs)


def _insight_built(server):
    response = server.app.test_client().get("/api/insight-jobs/?insight_names=i&project_id=p")
    return response.status_code == 200


def _model_schema(workspace):
    return open(schema_file(run_dir(str(workspace / "target")), "m")).read()


class TestRetryAfterAFailedRun:
    def test_a_failed_insight_is_retried_when_the_project_changes(self, workspace):
        _write_project(workspace)
        server, on_project_change, on_server_ready = _serve(workspace)
        on_server_ready(one_shot=False)
        assert not _insight_built(server)
        assert "units_sold" not in _model_schema(workspace)

        _create_sales_table(workspace)
        _write_project(workspace, title="Sales by quarter")
        on_project_change(one_shot=False)

        assert _insight_built(server)
        assert "units_sold" in _model_schema(workspace)

    def test_a_touch_with_no_config_change_still_retries(self, workspace):
        _write_project(workspace)
        server, on_project_change, on_server_ready = _serve(workspace)
        on_server_ready(one_shot=False)
        assert not _insight_built(server)

        _create_sales_table(workspace)
        on_project_change(one_shot=False)

        assert _insight_built(server)

    def test_a_fixed_model_sql_builds_the_model_and_its_insight(self, workspace):
        _create_sales_table(workspace)
        _write_project(workspace, table="ev_sales_typo")
        server, on_project_change, on_server_ready = _serve(workspace)
        on_server_ready(one_shot=False)
        assert not _insight_built(server)

        _write_project(workspace, table="ev_sales")
        on_project_change(one_shot=False)

        assert _insight_built(server)
        assert "units_sold" in _model_schema(workspace)

    def test_a_still_failing_object_is_retried_again_on_the_next_change(self, workspace, mocker):
        _write_project(workspace)
        server, on_project_change, on_server_ready = _serve(workspace)
        on_server_ready(one_shot=False)

        on_project_change(one_shot=False)
        assert not _insight_built(server)

        _create_sales_table(workspace)
        on_project_change(one_shot=False)
        assert _insight_built(server)

    def test_after_a_clean_retry_an_unchanged_project_does_not_run(self, workspace, mocker):
        _write_project(workspace)
        server, on_project_change, on_server_ready = _serve(workspace)
        on_server_ready(one_shot=False)
        _create_sales_table(workspace)
        on_project_change(one_shot=False)
        assert _insight_built(server)

        run_spy = mocker.patch("visivo.commands.serve_phase.run_phase")
        on_project_change(one_shot=False)

        run_spy.assert_not_called()

    def test_a_new_project_with_no_diff_keeps_the_full_rebuild(self, workspace, mocker):
        _write_project(workspace)
        _, on_project_change, on_server_ready = _serve(workspace, new=True)
        mocker.patch("visivo.commands.serve_phase.webbrowser.open")
        on_server_ready(one_shot=False)

        run_spy = mocker.patch(
            "visivo.commands.serve_phase.run_phase",
            side_effect=lambda **kwargs: mocker.Mock(
                project=kwargs["project"], failed_job_results=[]
            ),
        )
        on_project_change(one_shot=False)

        assert run_spy.call_args.kwargs["dag_filter"] == ""


class TestRetryHelpers:
    def test_retry_filter_selects_each_unbuilt_object_with_its_dependencies(self):
        project = ProjectFactory(models=[SqlModelFactory(name="m", source="ref(source)")])
        assert _retry_filter(project, {"m"}) == "+m+"

    def test_retry_filter_skips_objects_no_longer_in_the_project(self):
        project = ProjectFactory()
        assert _retry_filter(project, {"deleted_model"}) == ""

    def test_unbuilt_names_skip_results_without_a_name(self, mocker):
        runner = mocker.Mock(
            failed_job_results=[
                mocker.Mock(item=mocker.Mock(name="x", spec=["name"])),
                mocker.Mock(item=object()),
            ]
        )
        runner.failed_job_results[0].item.name = "i"
        assert _unbuilt_names(runner) == {"i"}
