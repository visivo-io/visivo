"""Tests for `visivo.commands.init_phase` scaffolding output."""

import os
from pathlib import Path
from unittest.mock import patch

import yaml

from visivo.commands.init_phase import (
    ENV_EXAMPLE_CONTENT,
    GITIGNORE_CONTENT,
    SCAFFOLD_TEMPLATE,
    init_phase,
)
from visivo.models.project import Project
from tests.support.utils import temp_folder


def test_basic_init_writes_scaffolded_yaml():
    """init_phase() writes a scaffolded YAML that Pydantic accepts."""
    tmp = temp_folder()
    project_dir = os.path.join(tmp, "my-scaffold-project")
    os.makedirs(project_dir, exist_ok=True)

    init_phase(project_dir)

    yml_path = Path(project_dir) / "project.visivo.yml"
    assert yml_path.exists()

    content = yml_path.read_text()
    # Comment markers (the user-facing copy) must be present.
    assert "# A Source is where your data lives" in content
    assert "# A Model is a SQL query saved against a Source." in content
    assert "# An Insight is a chart configured against a Model." in content
    assert "# A Dashboard arranges Insights into a layout." in content
    # name should match directory basename
    assert "name: my-scaffold-project" in content

    # The 2.0 vocabulary check — must not mention legacy concepts.
    assert "Trace" not in content
    assert "Selector" not in content

    # Pydantic must accept it (missing optional arrays default to [])
    data = yaml.safe_load(content)
    project = Project.model_validate(data)
    assert project.name == "my-scaffold-project"
    assert project.sources == []
    assert project.models == []
    assert project.insights == []
    assert project.dashboards == []


def test_basic_init_writes_gitignore():
    """init_phase() creates a .gitignore with the expected entries."""
    tmp = temp_folder()
    project_dir = os.path.join(tmp, "ignore-project")
    os.makedirs(project_dir, exist_ok=True)

    init_phase(project_dir)

    gitignore_path = Path(project_dir) / ".gitignore"
    assert gitignore_path.exists()
    content = gitignore_path.read_text()
    assert "target/" in content
    assert ".visivo/" in content
    assert ".env" in content
    assert "*.duckdb" in content
    assert ".DS_Store" in content


def test_basic_init_writes_env_example():
    """init_phase() creates a .env.example with the placeholder comment."""
    tmp = temp_folder()
    project_dir = os.path.join(tmp, "env-project")
    os.makedirs(project_dir, exist_ok=True)

    init_phase(project_dir)

    env_example_path = Path(project_dir) / ".env.example"
    assert env_example_path.exists()
    content = env_example_path.read_text()
    assert "Put data-source secrets here" in content


def test_init_does_not_overwrite_existing_files():
    """init_phase() must not overwrite an existing .gitignore or .env.example."""
    tmp = temp_folder()
    project_dir = os.path.join(tmp, "preserve-project")
    os.makedirs(project_dir, exist_ok=True)

    custom_gitignore = "# my custom gitignore\nnode_modules/\n"
    custom_env_example = "# my custom env example\nFOO=bar\n"

    Path(project_dir, ".gitignore").write_text(custom_gitignore)
    Path(project_dir, ".env.example").write_text(custom_env_example)

    init_phase(project_dir)

    assert Path(project_dir, ".gitignore").read_text() == custom_gitignore
    assert Path(project_dir, ".env.example").read_text() == custom_env_example


@patch("visivo.commands.init_phase.load_example_project")
def test_example_init_still_works(mock_load_example):
    """init_phase(example_type=...) delegates to load_example_project."""
    tmp = temp_folder()
    project_dir = os.path.join(tmp, "example-project")
    os.makedirs(project_dir, exist_ok=True)

    mock_load_example.return_value = os.path.join(project_dir, "project.visivo.yml")

    result = init_phase(project_dir, example_type="github-releases")

    mock_load_example.assert_called_once_with(
        "example-project",
        "github-releases",
        project_dir,
    )
    assert result == os.path.join(project_dir, "project.visivo.yml")


def test_scaffold_template_constants_are_strings():
    """Sanity: exported constants are non-empty strings."""
    assert isinstance(SCAFFOLD_TEMPLATE, str) and len(SCAFFOLD_TEMPLATE) > 0
    assert isinstance(GITIGNORE_CONTENT, str) and "target/" in GITIGNORE_CONTENT
    assert isinstance(ENV_EXAMPLE_CONTENT, str) and ENV_EXAMPLE_CONTENT.startswith("#")
