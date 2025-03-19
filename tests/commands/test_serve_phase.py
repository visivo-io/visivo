import os
import pytest
from tests.factories.model_factories import ProjectFactory, DashboardFactory, TraceFactory
from tests.support.utils import temp_file, temp_folder
from visivo.commands.serve_phase import serve_phase
from visivo.commands.utils import create_file_database
from visivo.server.hot_reload_server import HotReloadServer
import json

TRACE_NAME = "test_trace"

def get_test_port():
    """Get an available port for testing"""
    return HotReloadServer.find_available_port()

@pytest.fixture
def test_project():
    project = ProjectFactory()
    additional_dashboard = DashboardFactory(name="Other Dashboard")
    project.dashboards.append(additional_dashboard)
    return project

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
    trace = TraceFactory(name=TRACE_NAME)
    project.traces.append(trace)
    
    # Create SQLite database
    create_file_database(url=project.sources[0].url(), output_dir=output_dir)
    
    return project

def test_serve_phase_creates_server(test_project, output_dir, server_url):
    # Ensure output directory exists
    os.makedirs(output_dir, exist_ok=True)
    
    server, _, _ = serve_phase(
        output_dir=output_dir,
        working_dir=".",
        default_source=None,
        dag_filter=None,
        threads=1,
        thumbnail_mode=None,
        skip_compile=True,
        project=test_project,
        server_url=server_url
    )
    assert server is not None

def test_serve_phase_handles_dbt_ignore_patterns(test_project, output_dir, server_url):
    # Ensure output directory exists
    os.makedirs(output_dir, exist_ok=True)
    
    # Set up a mock dbt configuration
    test_project.dbt = type('MockDbt', (), {
        'enabled': True,
        'get_output_file': lambda output_dir, working_dir, *args: 'mock_dbt_file'
    })()

    server, _, _ = serve_phase(
        output_dir=output_dir,
        working_dir=".",
        default_source=None,
        dag_filter=None,
        threads=1,
        thumbnail_mode=None,
        skip_compile=True,
        project=test_project,
        server_url=server_url
    )

    assert 'mock_dbt_file' in server.ignore_patterns
