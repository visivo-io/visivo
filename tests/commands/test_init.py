import os
from pathlib import Path
from unittest.mock import patch, MagicMock
from visivo.commands.init import init
from tests.support.utils import temp_folder
from click.testing import CliRunner

runner = CliRunner()


def test_init_with_project_dir():
    """Test that init with project_dir creates project in specified directory"""
    tmp = temp_folder()
    project_dir = os.path.join(tmp, "my-test-project")
    os.makedirs(project_dir, exist_ok=True)

    response = runner.invoke(init, args=["--project-dir", project_dir, "--bare"])

    assert response.exit_code == 0, f"Command failed with output: {response.output}"
    assert "Done" in response.output
    assert os.path.exists(f"{project_dir}/project.visivo.yml")

    # Check that project name matches the directory name
    project_content = Path(f"{project_dir}/project.visivo.yml").read_text()
    assert "name: my-test-project" in project_content
    # Scaffold places `sources:` followed by commented examples, not `sources: []`
    assert "sources:" in project_content
    assert "# A Source is where your data lives" in project_content


@patch("visivo.commands.init_phase.load_example_project")
def test_init_with_example_value(mock_load_example):
    """Test that init with --example calls load_example_project function"""
    tmp = temp_folder()
    project_dir = os.path.join(tmp, "example-project")
    os.makedirs(project_dir, exist_ok=True)

    # Mock the load_example_project function to return success
    mock_load_example.return_value = f"{project_dir}/project.visivo.yml"

    response = runner.invoke(
        init,
        args=["--project-dir", project_dir, "--example", "github-releases", "--bare"],
    )

    assert response.exit_code == 0, f"Command failed with output: {response.output}"
    assert "Done" in response.output

    # Verify that load_example_project was called with correct arguments
    mock_load_example.assert_called_once_with(
        "example-project",  # project name (directory name)
        "github-releases",  # example type
        project_dir,  # project directory
    )


def test_init_basic_creates_simple_project():
    """Test that basic init creates a simple project.visivo.yml file"""
    tmp = temp_folder()
    os.makedirs(f"{tmp}", exist_ok=True)

    response = runner.invoke(init, args=["--project-dir", tmp, "--bare"])

    assert response.exit_code == 0, f"Command failed with output: {response.output}"
    assert "Done" in response.output
    assert os.path.exists(f"{tmp}/project.visivo.yml")

    # Check that basic project structure is created (scaffolded YAML)
    project_content = Path(f"{tmp}/project.visivo.yml").read_text()
    project_name = os.path.basename(tmp)
    assert f"name: {project_name}" in project_content
    assert "sources:" in project_content
    assert "models:" in project_content
    assert "insights:" in project_content
    assert "dashboards:" in project_content
