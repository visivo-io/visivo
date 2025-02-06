import os
import pytest
from tests.factories.model_factories import ProjectFactory, DashboardFactory, TraceFactory
from tests.support.utils import temp_file, temp_folder
from visivo.commands.serve_phase import serve_phase
from visivo.commands.utils import create_file_database

@pytest.fixture
def test_project():
    project = ProjectFactory()
    additional_dashboard = DashboardFactory(name="Other Dashboard")
    project.dashboards.append(additional_dashboard)
    return project

@pytest.fixture
def server_url():
    return "http://localhost:8000"

@pytest.fixture
def output_dir():
    return temp_folder()

@pytest.fixture
def setup_project_with_data(output_dir):
    project = ProjectFactory()
    trace = TraceFactory(name="test_trace")
    project.traces.append(trace)
    
    # Create SQLite database
    create_file_database(url=project.sources[0].url(), output_dir=output_dir)
    
    return project

def test_serve_phase_creates_server(test_project, output_dir, server_url):
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

def test_serve_phase_with_data(setup_project_with_data, output_dir, server_url):
    project = setup_project_with_data
    
    server, on_project_change, on_server_ready = serve_phase(
        output_dir=output_dir,
        working_dir=".",
        default_source=None,
        dag_filter=None,
        threads=1,
        thumbnail_mode=None,
        skip_compile=True,
        project=project,
        server_url=server_url
    )
    
    # Test that server is created with correct configuration
    assert server is not None
    assert server.app is not None
    
    # Test that callbacks work with actual data
    on_server_ready(one_shot=True)  # This will trigger data generation
    
    # Verify data files were created
    trace_data_path = os.path.join(output_dir, "traces", f"{project.traces[0].name}.json")
    assert os.path.exists(trace_data_path)

def test_serve_phase_callbacks_handle_one_shot(test_project, output_dir, server_url):
    server, on_project_change, on_server_ready = serve_phase(
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
    
    # Test that callbacks accept one_shot parameter
    on_project_change(one_shot=True)
    on_server_ready(one_shot=True)

def test_serve_phase_handles_dbt_ignore_patterns(test_project, output_dir, server_url):
    # Set up a mock dbt configuration
    test_project.dbt = type('MockDbt', (), {
        'enabled': True,
        'get_output_file': lambda x, y: 'mock_dbt_file'
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
