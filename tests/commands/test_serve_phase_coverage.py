"""Coverage-focused behavioral tests for serve_phase.

Covers on_server_ready (initial build, browser-open for `new`, and the
re-raising failure envelope) plus the on_project_change failure path that writes
error.json, and the one-shot success branch.
"""

import json
import os

import pytest

from tests.factories.model_factories import ProjectFactory
from tests.support.utils import temp_folder
from visivo.commands.serve_phase import serve_phase
from visivo.commands.utils import create_file_database
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


class TestOnServerReady:
    def test_one_shot_runs_initial_build(self, project_with_data, output_dir, server_url, mocker):
        # run_phase is a separate heavy phase; isolate serve_phase's orchestration.
        run_spy = mocker.patch("visivo.commands.serve_phase.run_phase")
        _, _, on_server_ready = _serve(project_with_data, output_dir, server_url)

        on_server_ready(one_shot=True)

        run_spy.assert_called_once()

    def test_new_project_opens_browser_with_onboarding(
        self, project_with_data, output_dir, server_url, mocker
    ):
        mocker.patch("visivo.commands.serve_phase.run_phase")
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
        mocker.patch("visivo.commands.serve_phase.run_phase")
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
            return_value=mocker.Mock(project=compiled),
        )

        on_project_change(one_shot=True)

        with open(f"{output_dir}/error.json") as fp:
            assert json.load(fp) == {}
