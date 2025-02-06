import os
import json
from visivo.commands.dist import dist
from visivo.parsers.file_names import PROJECT_FILE_NAME
from visivo.commands.utils import create_file_database
from click.testing import CliRunner
from tests.support.utils import temp_yml_file, temp_folder
from tests.factories.model_factories import ProjectFactory, TraceFactory, SqlModelFactory
import pytest

runner = CliRunner()

@pytest.fixture
def output_dir():
    return temp_folder()

@pytest.fixture
def dist_dir():
    return temp_folder()

@pytest.fixture
def setup_project(output_dir):
    project = ProjectFactory()
    # Add a trace to test data copying
    model = SqlModelFactory(name="test_model")
    trace = TraceFactory(name="test_trace", model=model)
    project.traces.append(trace)
    
    create_file_database(url=project.sources[0].url(), output_dir=output_dir)
    
    tmp = temp_yml_file(
        dict=json.loads(project.model_dump_json()), 
        name=PROJECT_FILE_NAME
    )
    working_dir = os.path.dirname(tmp)
    return project, working_dir

def test_dist_creates_dist_folder(setup_project, output_dir, dist_dir):
    project, working_dir = setup_project
    
    # First run the project to generate data
    from visivo.commands.run import run
    run_result = runner.invoke(run, ["-w", working_dir, "-o", output_dir, "-s", "source"])
    assert run_result.exit_code == 0
    
    # Then run dist to package it
    result = runner.invoke(
        dist, 
        ["--output-dir", output_dir,
         "--dist-dir", dist_dir]
    )
    assert result.exit_code == 0
    assert "Created dist folder" in result.output
    
    # Check directory structure
    assert os.path.exists(os.path.join(os.getcwd(), dist_dir, "data"))
    assert os.path.exists(os.path.join(os.getcwd(), dist_dir, "data", "trace"))
    assert os.path.exists(os.path.join(os.getcwd(), dist_dir, "data", "error.json"))
    assert os.path.exists(os.path.join(os.getcwd(), dist_dir, "data", "project.json"))
    assert os.path.exists(os.path.join(os.getcwd(), dist_dir, "data", "dashboard-thumbnails"))
    
    # Verify project.json has created_at field
    with open(os.path.join(dist_dir, "data", "project.json")) as project_json:
        data = json.load(project_json)
        assert "created_at" in data
        assert "project_json" in data

def test_dist_errors_without_data(setup_project, output_dir, dist_dir):
    project, working_dir = setup_project
    
    # Try to run dist without running project first
    result = runner.invoke(
        dist, 
        ["--output-dir", output_dir,
         "--dist-dir", dist_dir]
    )
    
    # Check for error message instead of exit code since dist_phase catches exceptions
    assert "Error creating dist" in result.output
    assert "Try running `visivo run`" in result.output

def test_dist_errors_with_invalid_working_dir(output_dir, dist_dir):
    result = runner.invoke(
        dist, 
        ["--output-dir", "nonexistent_dir",
         "--dist-dir", dist_dir]
    )
    
    # Check for error message instead of exit code
    assert "Error creating dist" in result.output

def test_dist_errors_with_invalid_project_file(output_dir, dist_dir):
    # Create an empty working directory without project file
    working_dir = temp_folder()
    
    result = runner.invoke(
        dist, 
        ["--output-dir", output_dir,
         "--dist-dir", dist_dir]
    )
    
    # Check for error message instead of exit code
    assert "Error creating dist" in result.output
