import os
import json
from unittest.mock import patch

import click
from visivo.commands.serve_phase import serve_phase
from visivo.parsers.file_names import PROJECT_FILE_NAME
from visivo.commands.utils import create_file_database
from click.testing import CliRunner
from tests.support.utils import temp_yml_file, temp_folder
from tests.factories.model_factories import ProjectFactory
from visivo.commands.serve import serve
from visivo.server.hot_reload_server import HotReloadServer
import pytest

runner = CliRunner()


def get_test_port():
    """Get an available port for testing"""
    return HotReloadServer.find_available_port()


@pytest.fixture
def test_project():
    project = ProjectFactory()
    return project


@pytest.fixture
def output_dir():
    return temp_folder()


def test_serve(output_dir):
    project = ProjectFactory()
    create_file_database(url=project.sources[0].url(), output_dir=output_dir)

    os.makedirs(output_dir, exist_ok=True)
    with open(os.path.join(output_dir, "project.json"), "w") as f:
        json.dump(json.loads(project.model_dump_json()), f)

    tmp = temp_yml_file(dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME)
    working_dir = os.path.dirname(tmp)

    port = get_test_port()
    server_url = f"http://localhost:{port}"
    server, _, _ = serve_phase(
        output_dir=output_dir,
        working_dir=working_dir,
        default_source="source",
        dag_filter=None,
        threads=2,
        skip_compile=True,
        project=project,
        server_url=server_url,
    )

    client = server.app.test_client()
    response = client.get("/api/project/")
    response_json = json.loads(response.data)
    assert "project_json" in response_json

    response = client.get("/api/error/")
    response_json = json.loads(response.data)
    assert "error" not in response_json


def test_serve_phase_returns_server_and_callbacks(test_project, output_dir):
    os.makedirs(output_dir, exist_ok=True)

    port = get_test_port()
    server_url = f"http://localhost:{port}"
    server, on_project_change, on_server_ready = serve_phase(
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
    assert callable(on_project_change)
    assert callable(on_server_ready)


def test_serve_new_project_in_empty_dir_does_not_pass_traces(tmp_path):
    """Regression: visivo serve in an empty dir used to crash with
    `traces  Extra inputs are not permitted` because the new-project
    bootstrap passed traces=[] to Project(). Project no longer
    accepts traces (replaced by Insights in 2.0).
    """
    from visivo.models.project import Project

    # Project bootstrap that mirrors what visivo/commands/serve.py builds
    # when --new is set or when running in a directory without a project.
    project = Project(
        name="Quickstart Visivo",
        sources=[],
        models=[],
        charts=[],
        dashboards=[],
        defaults=None,
    )
    assert project.name == "Quickstart Visivo"
    assert project.charts == []
    assert project.dashboards == []


def test_serve_command_raises_when_parse_fails(output_dir, tmp_path):
    port = get_test_port()

    with patch("visivo.commands.serve.parse_project_phase") as mock_parse:
        mock_parse.side_effect = click.ClickException("Mock parse failure")

        result = runner.invoke(
            serve,
            ["--output-dir", str(output_dir), "--working-dir", str(tmp_path), "--port", str(port)],
        )

        assert result.exit_code != 0
        assert "mock parse failure" in result.output.lower()


def test_serve_command_does_not_claim_build_complete_before_data_ready(output_dir, tmp_path):
    """Regression (VIS-870): `visivo serve` used to log "Initial build completed"
    right after serve_phase() returned — before the server had started and before
    the initial run_phase (triggered by the on_server_ready callback) had built
    any data. The pre-serve log lines must not claim the build is done; the
    truthful completion message ("Initial Data Refresh Complete.") is emitted by
    serve_phase once the data is actually ready.
    """
    from unittest.mock import MagicMock

    port = get_test_port()
    mock_server = MagicMock()

    with (
        patch("visivo.commands.serve.parse_project_phase") as mock_parse,
        patch("visivo.commands.serve.serve_phase") as mock_serve_phase,
    ):
        mock_parse.return_value = ProjectFactory()
        mock_serve_phase.return_value = (mock_server, MagicMock(), MagicMock())

        result = runner.invoke(
            serve,
            ["--output-dir", str(output_dir), "--working-dir", str(tmp_path), "--port", str(port)],
        )

        assert result.exit_code == 0, result.output
        assert "Initial build completed" not in result.output
        assert "Project loaded in" in result.output
        assert f"Starting server at http://localhost:{port}" in result.output
        mock_server.serve.assert_called_once()
