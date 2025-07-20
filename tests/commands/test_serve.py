import os
import json
from visivo.commands.serve_phase import serve_phase
from visivo.parsers.file_names import PROJECT_FILE_NAME
from visivo.commands.utils import create_file_database
from click.testing import CliRunner
from tests.support.utils import temp_yml_file, temp_folder
from tests.factories.model_factories import ProjectFactory, DashboardFactory, TraceFactory
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


@pytest.fixture
def setup_project_with_data(output_dir):
    # Create a project with a trace that will query the SQLite database
    project = ProjectFactory()
    trace = TraceFactory(name="test_trace")
    project.traces.append(trace)

    # Create the SQLite database
    create_file_database(url=project.sources[0].url(), output_dir=output_dir)

    # Create project.json
    tmp = temp_yml_file(dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME)
    working_dir = os.path.dirname(tmp)

    return project, working_dir


def test_serve(output_dir):
    project = ProjectFactory()
    create_file_database(url=project.sources[0].url(), output_dir=output_dir)

    # Create project.json
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

    # Test the Flask app directly
    client = server.app.test_client()
    response = client.get("/api/project/")
    response_json = json.loads(response.data)
    assert "project_json" in response_json

    response = client.get("/api/error/")
    response_json = json.loads(response.data)
    assert "error" not in response_json


def test_serve_phase_returns_server_and_callbacks(test_project, output_dir):
    # Ensure output directory exists
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


def test_serve_command_handles_errors(output_dir):
    with runner.isolated_filesystem():
        port = get_test_port()
        result = runner.invoke(
            serve, ["--output-dir", output_dir, "--working-dir", ".", "--port", str(port)]
        )
        assert result.exit_code != 0
        assert "error" in result.output.lower()
