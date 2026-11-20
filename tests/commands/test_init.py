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


def _fake_serve_phase(captured):
    def fake(**kwargs):
        captured.update(kwargs)
        return MagicMock(), MagicMock(), MagicMock()

    return fake


def test_init_example_opens_the_browser_on_the_sample_dashboard(monkeypatch):
    monkeypatch.chdir(os.getcwd())
    tmp = temp_folder()
    project_dir = os.path.abspath(os.path.join(tmp, "ev"))
    captured = {}
    with patch("visivo.commands.serve_phase.serve_phase", _fake_serve_phase(captured)):
        response = runner.invoke(
            init, args=["--project-dir", project_dir, "--example", "ev-sales", "--port", "8123"]
        )

    assert response.exit_code == 0, response.output
    assert captured["open_path"] == "/project/EV%20Sales%20Overview"
    assert captured["new"] is True
    assert captured["skip_compile"] is False
    assert os.getcwd() == os.path.abspath(project_dir)
    assert captured["working_dir"] == os.path.abspath(project_dir)


def test_init_scaffold_opens_the_onboarding_start_screen(monkeypatch):
    monkeypatch.chdir(os.getcwd())
    tmp = temp_folder()
    captured = {}
    with patch("visivo.commands.serve_phase.serve_phase", _fake_serve_phase(captured)):
        response = runner.invoke(init, args=["--project-dir", tmp, "--headless"])

    assert response.exit_code == 0, response.output
    assert captured["open_path"] is None
    assert captured["onboarding"] is True
    assert captured["new"] is False


def test_first_dashboard_path_quotes_the_name_and_handles_no_dashboards():
    from visivo.commands.init import first_dashboard_path
    from visivo.models.dashboard import Dashboard
    from visivo.models.project import Project

    assert first_dashboard_path(Project(name="p")) is None
    project = Project(name="p", dashboards=[Dashboard(name="A/B Overview"), Dashboard(name="z")])
    assert first_dashboard_path(project) == "/project/A%2FB%20Overview"


def test_init_example_prints_cloud_next_steps_once_the_sample_is_built(monkeypatch):
    monkeypatch.chdir(os.getcwd())
    tmp = temp_folder()
    project_dir = os.path.abspath(os.path.join(tmp, "gh"))
    server = MagicMock()
    built = MagicMock()
    logged = MagicMock()
    monkeypatch.setattr("visivo.commands.cloud_next_steps.log_cloud_next_steps", logged)
    with patch(
        "visivo.commands.serve_phase.serve_phase", lambda **kwargs: (server, MagicMock(), built)
    ):
        response = runner.invoke(
            init, args=["--project-dir", project_dir, "--example", "github-releases"]
        )

    assert response.exit_code == 0, response.output
    logged.assert_not_called()
    server.serve.call_args.kwargs["on_server_ready"]()
    built.assert_called_once()
    logged.assert_called_once_with("github-releases")


def test_init_scaffold_does_not_wrap_on_ready(monkeypatch):
    monkeypatch.chdir(os.getcwd())
    tmp = temp_folder()
    server = MagicMock()
    on_ready = MagicMock()
    with patch(
        "visivo.commands.serve_phase.serve_phase", lambda **kwargs: (server, MagicMock(), on_ready)
    ):
        response = runner.invoke(init, args=["--project-dir", tmp, "--headless"])

    assert response.exit_code == 0, response.output
    assert server.serve.call_args.kwargs["on_server_ready"] is on_ready
