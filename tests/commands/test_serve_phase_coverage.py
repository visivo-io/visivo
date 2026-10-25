"""Coverage-focused behavioral tests for serve_phase.

Covers on_server_ready (initial build, browser-open for `new`, and the
re-raising failure envelope) plus the on_project_change failure path that writes
error.json, and the one-shot success branch.
"""

import json
import os

import pytest

from tests.factories.model_factories import (
    ChartFactory,
    DashboardFactory,
    InsightFactory,
    ItemFactory,
    ProjectFactory,
    RowFactory,
    SqlModelFactory,
)
from tests.support.utils import temp_folder
from visivo.commands.serve_phase import serve_phase
from visivo.commands.utils import create_file_database
from visivo.server.hot_reload_server import HotReloadServer
from visivo.server.managers.run_manager import RunManager


@pytest.fixture
def output_dir():
    d = temp_folder()
    os.makedirs(d, exist_ok=True)
    return d


@pytest.fixture
def server_url():
    return f"http://localhost:{HotReloadServer.find_available_port()}"


@pytest.fixture
def project_with_data(output_dir):
    project = ProjectFactory()
    create_file_database(url=project.sources[0].url(), output_dir=output_dir)
    return project


@pytest.fixture
def project_with_one_broken_query(output_dir):
    good_model = SqlModelFactory(name="good_model", source="ref(source)")
    broken_model = SqlModelFactory(
        name="broken_model", source="ref(source)", sql="select * from missing_table"
    )
    good = InsightFactory(name="good_insight", model=good_model)
    broken = InsightFactory(name="broken_insight", model=broken_model)
    items = [
        ItemFactory(name="good_item", chart=ChartFactory(name="good_chart", insights=[good])),
        ItemFactory(name="broken_item", chart=ChartFactory(name="broken_chart", insights=[broken])),
    ]
    dashboard = DashboardFactory(name="dashboard", rows=[RowFactory(name="row", items=items)])
    project = ProjectFactory(models=[good_model, broken_model], dashboards=[dashboard])
    create_file_database(url=project.sources[0].url(), output_dir=output_dir)
    return project


@pytest.fixture
def fresh_run_manager():
    RunManager._instance = None
    yield
    RunManager._instance = None


def _serve(project, output_dir, server_url, **overrides):
    kwargs = dict(
        output_dir=output_dir,
        working_dir=".",
        default_source=None,
        dag_filter=None,
        threads=1,
        skip_compile=True,
        project=project,
        server_url=server_url,
    )
    kwargs.update(overrides)
    return serve_phase(**kwargs)


class TestOnServerReady:
    def test_one_shot_runs_initial_build(self, project_with_data, output_dir, server_url, mocker):
        # run_phase is a separate heavy phase; isolate serve_phase's orchestration.
        run_spy = mocker.patch(
            "visivo.commands.serve_phase.run_phase", return_value=mocker.Mock(failed_job_results=[])
        )
        _, _, on_server_ready = _serve(project_with_data, output_dir, server_url)

        on_server_ready(one_shot=True)

        run_spy.assert_called_once()

    def test_new_project_opens_browser_with_onboarding(
        self, project_with_data, output_dir, server_url, mocker
    ):
        mocker.patch(
            "visivo.commands.serve_phase.run_phase", return_value=mocker.Mock(failed_job_results=[])
        )
        open_mock = mocker.patch("visivo.commands.serve_phase.webbrowser.open")
        _, _, on_server_ready = _serve(
            project_with_data, output_dir, server_url, new=True, onboarding=True
        )

        on_server_ready(one_shot=False)

        open_mock.assert_called_once()
        opened_url = open_mock.call_args[0][0]
        assert opened_url == f"{server_url}/?onboarding=1"

    def test_new_project_without_onboarding_opens_bare_url(
        self, project_with_data, output_dir, server_url, mocker
    ):
        mocker.patch(
            "visivo.commands.serve_phase.run_phase", return_value=mocker.Mock(failed_job_results=[])
        )
        open_mock = mocker.patch("visivo.commands.serve_phase.webbrowser.open")
        _, _, on_server_ready = _serve(project_with_data, output_dir, server_url, new=True)

        on_server_ready(one_shot=False)

        open_mock.assert_called_once_with(server_url, new=0, autoraise=True)

    def test_run_failure_is_logged_and_reraised(
        self, project_with_data, output_dir, server_url, mocker
    ):
        _, _, on_server_ready = _serve(project_with_data, output_dir, server_url)
        mocker.patch(
            "visivo.commands.serve_phase.run_phase", side_effect=RuntimeError("build blew up")
        )
        with pytest.raises(RuntimeError, match="build blew up"):
            on_server_ready(one_shot=False)

    def test_a_failed_query_is_reported_and_the_rest_is_served(
        self, project_with_one_broken_query, output_dir, server_url, fresh_run_manager
    ):
        server, _, on_server_ready = _serve(project_with_one_broken_query, output_dir, server_url)

        on_server_ready(one_shot=False)

        client = server.app.test_client()
        insights = "/api/insight-jobs/?insight_names={}&project_id=p"
        assert client.get(insights.format("good_insight")).status_code == 200
        assert client.get(insights.format("broken_insight")).status_code == 404
        runs = client.get("/api/projects/p/run/").get_json()
        assert [run["state"] for run in runs] == ["failed"]
        failed_objects = [d["object"]["name"] for d in runs[0]["error_json"]["diagnostics"]]
        assert "broken_insight" in failed_objects
        assert "good_insight" not in failed_objects


class TestOnProjectChangeErrorHandling:
    def test_compile_failure_writes_error_json(
        self, project_with_data, output_dir, server_url, mocker
    ):
        _, on_project_change, _ = _serve(project_with_data, output_dir, server_url)
        mocker.patch(
            "visivo.commands.serve_phase.compile_phase",
            side_effect=RuntimeError("unparseable yaml"),
        )

        on_project_change()

        with open(f"{output_dir}/error.json") as fp:
            payload = json.load(fp)
        assert "unparseable yaml" in payload["message"]

    def test_one_shot_success_clears_error_json(
        self, project_with_data, output_dir, server_url, mocker
    ):
        # new=True forces the run_phase branch even when the recompiled project
        # matches, so the one-shot success path (and its empty error.json) runs.
        _, on_project_change, _ = _serve(project_with_data, output_dir, server_url, new=True)
        compiled = ProjectFactory()
        mocker.patch("visivo.commands.serve_phase.compile_phase", return_value=compiled)
        mocker.patch(
            "visivo.commands.serve_phase.run_phase",
            return_value=mocker.Mock(project=compiled, failed_job_results=[]),
        )

        on_project_change(one_shot=True)

        with open(f"{output_dir}/error.json") as fp:
            assert json.load(fp) == {}


class TestWatcherScope:
    def test_watcher_only_reloads_for_files_the_project_includes(
        self, project_with_data, output_dir, server_url, tmp_path
    ):
        (tmp_path / "project.visivo.yml").write_text("name: p\nincludes:\n  - path: models.yml\n")
        (tmp_path / "models.yml").write_text("models: []\n")
        server, _, _ = _serve(project_with_data, output_dir, server_url, working_dir=str(tmp_path))

        assert server.is_project_file(str(tmp_path / "project.visivo.yml"))
        assert server.is_project_file(str(tmp_path / "models.yml"))
        assert not server.is_project_file(str(tmp_path / "tmp.yml"))


def _capture_flask_app(mocker):
    from visivo.server.flask_app import FlaskApp

    created = []

    def build(*args, **kwargs):
        created.append(FlaskApp(*args, **kwargs))
        return created[0]

    mocker.patch("visivo.commands.serve_phase.FlaskApp", side_effect=build)
    return created


class TestProjectErrorState:
    def test_compile_failure_is_kept_on_the_app_and_success_clears_it(
        self, project_with_data, output_dir, server_url, mocker
    ):
        flask_app = _capture_flask_app(mocker)
        _, on_project_change, _ = _serve(project_with_data, output_dir, server_url)
        compile_mock = mocker.patch(
            "visivo.commands.serve_phase.compile_phase",
            side_effect=RuntimeError("bad reference"),
        )
        on_project_change()
        assert flask_app[0].project_error == "bad reference"

        compile_mock.side_effect = None
        compile_mock.return_value = ProjectFactory()
        on_project_change()
        assert flask_app[0].project_error is None

    def test_a_failure_after_compile_is_not_a_validation_error(
        self, project_with_data, output_dir, server_url, mocker
    ):
        flask_app = _capture_flask_app(mocker)
        _, on_project_change, _ = _serve(project_with_data, output_dir, server_url, new=True)
        mocker.patch("visivo.commands.serve_phase.compile_phase", return_value=ProjectFactory())
        mocker.patch("visivo.commands.serve_phase.run_phase", side_effect=RuntimeError("run broke"))

        on_project_change()

        assert flask_app[0].project_error is None

    def test_stacktrace_env_adds_the_traceback_to_error_json(
        self, project_with_data, output_dir, server_url, mocker, monkeypatch
    ):
        monkeypatch.setenv("STACKTRACE", "1")
        _, on_project_change, _ = _serve(project_with_data, output_dir, server_url)
        mocker.patch(
            "visivo.commands.serve_phase.compile_phase", side_effect=RuntimeError("bad yaml")
        )

        on_project_change()

        with open(f"{output_dir}/error.json") as fp:
            assert "Traceback" in json.load(fp)["message"]
