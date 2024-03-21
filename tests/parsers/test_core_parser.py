import click
import yaml
import pytest
from tests.support.utils import temp_yml_file, temp_file, temp_folder
from pathlib import Path
from visivo.parsers.core_parser import CoreParser, PROJECT_FILE_NAME, PROFILE_FILE_NAME
from visivo.parsers.line_validation_error import LineValidationError
from visivo.parsers.yaml_ordered_dict import setup_yaml_ordered_dict


def test_Core_Parser_with_empty_project():
    tmp = temp_yml_file(
        {"name": "project"},
        name="project.visivo.yml",
    )

    core_parser = CoreParser(project_file=tmp, files=[tmp])
    project = core_parser.parse()
    assert project.name == "project"


def test_Core_Parser_with_one_of_each_project():
    tmp = temp_yml_file(
        {
            "name": "project",
            "dashboards": [{"name": "dashboard"}],
            "charts": [{"name": "chart"}],
            "traces": [
                {
                    "name": "trace",
                    "model": {
                        "sql": "select * from table",
                        "target": {
                            "name": "target",
                            "database": "postgresql",
                            "type": "postgresql",
                        },
                    },
                    "props": {"type": "scatter", "x": "query(x)", "y": "query(y)"},
                }
            ],
        },
        name=PROJECT_FILE_NAME,
    )
    core_parser = CoreParser(project_file=tmp, files=[tmp])
    project = core_parser.parse()
    assert project.name == "project"
    assert project.dashboards[0].name == "dashboard"
    assert project.charts[0].name == "chart"
    assert project.traces[0].name == "trace"


def test_Core_Parser_with_env_var(monkeypatch):
    monkeypatch.setenv("NAME", "test_name")

    tmp = temp_yml_file(
        {"name": '{{ env_var("NAME") }}'},
        name=PROJECT_FILE_NAME,
    )
    core_parser = CoreParser(project_file=tmp, files=[tmp])
    project = core_parser.parse()
    assert project.name == "test_name"


def test_Core_Parser_combines_different_files():
    project_file = temp_yml_file(
        {
            "name": "project",
            "targets": [
                {"name": "target", "database": "project_url", "type": "sqlite"}
            ],
        },
        name=PROJECT_FILE_NAME,
    )
    other_file = temp_yml_file(
        {
            "name": "project",
            "targets": [{"name": "local", "database": "other_url", "type": "sqlite"}],
        },
        name="other.yml",
    )

    core_parser = CoreParser(
        project_file=project_file, files=[project_file, other_file]
    )
    project = core_parser.parse()
    assert len(project.targets) == 2
    assert project.targets[0].database == "project_url"
    assert project.targets[1].database == "other_url"


def test_Core_Parser_invalid_yaml():
    project_file = temp_file(
        contents="""
        name: project
        targets invalid
        """,
        name=PROJECT_FILE_NAME,
    )

    core_parser = CoreParser(project_file=project_file, files=[project_file])
    with pytest.raises(click.ClickException) as exc_info:
        core_parser.parse()

    assert (
        exc_info.value.message
        == f"Invalid yaml in project\n  Location: {project_file}:4[9]\n  Issue: could not find expected ':'"
    )


def test_Core_Parser_value_error():
    project_file = temp_file(
        contents="""
        traces: 
            - name: Trace Name
        """,
        name=PROJECT_FILE_NAME,
    )

    core_parser = CoreParser(project_file=project_file, files=[project_file])
    with pytest.raises(LineValidationError) as exc_info:
        core_parser.parse()

    assert f"Location: {project_file}:3" in str(exc_info.value)


def test_Core_Parser_success():
    project_file = temp_file(
        contents=""" name: Project Name """,
        name=PROJECT_FILE_NAME,
    )

    core_parser = CoreParser(project_file=project_file, files=[project_file])
    project = core_parser.parse()

    assert project.name == "Project Name"
