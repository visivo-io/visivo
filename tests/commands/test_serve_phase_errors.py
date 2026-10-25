import json
import os

import pytest

from tests.factories.model_factories import ProjectFactory
from tests.support.utils import temp_folder
from visivo.commands.serve_phase import serve_phase
from visivo.commands.utils import create_file_database
from visivo.logger.logger import Logger
from visivo.server.hot_reload_server import HotReloadServer


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


class TestStacktraceAndBrowserErrors:
    def test_compile_failure_with_stacktrace_writes_the_traceback(
        self, project_with_data, output_dir, server_url, mocker, monkeypatch
    ):
        monkeypatch.setenv("STACKTRACE", "true")
        _, on_project_change, _ = _serve(project_with_data, output_dir, server_url)
        mocker.patch(
            "visivo.commands.serve_phase.compile_phase", side_effect=RuntimeError("bad yaml")
        )

        on_project_change()

        with open(f"{output_dir}/error.json") as fp:
            message = json.load(fp)["message"]
        assert "bad yaml" in message
        assert "Traceback" in message

    def test_browser_open_failure_does_not_stop_the_serve(
        self, project_with_data, output_dir, server_url, mocker, monkeypatch
    ):
        monkeypatch.setenv("STACKTRACE", "true")
        mocker.patch(
            "visivo.commands.serve_phase.run_phase", return_value=mocker.Mock(failed_job_results=[])
        )
        mocker.patch(
            "visivo.commands.serve_phase.webbrowser.open", side_effect=RuntimeError("no browser")
        )
        error_spy = mocker.spy(Logger.instance(), "error")
        _, _, on_server_ready = _serve(project_with_data, output_dir, server_url, new=True)

        on_server_ready(one_shot=False)

        logged = [call.args[0] for call in error_spy.call_args_list]
        assert any("no browser" in line and "Traceback" in line for line in logged)

    def test_run_failure_with_stacktrace_logs_the_traceback(
        self, project_with_data, output_dir, server_url, mocker, monkeypatch
    ):
        monkeypatch.setenv("STACKTRACE", "true")
        mocker.patch(
            "visivo.commands.serve_phase.run_phase", side_effect=RuntimeError("build blew up")
        )
        error_spy = mocker.spy(Logger.instance(), "error")
        _, _, on_server_ready = _serve(project_with_data, output_dir, server_url)

        with pytest.raises(RuntimeError):
            on_server_ready(one_shot=False)

        assert any("Traceback" in call.args[0] for call in error_spy.call_args_list)
