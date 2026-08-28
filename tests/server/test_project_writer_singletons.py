"""A top-level singleton block (``defaults:``) must actually be written.

``ProjectWriter._update`` locates the child to change by recursing for a dict
whose ``name`` equals the child's name. The YAML ``defaults:`` mapping has no
``name`` key, so the recursion never matched: it returned False, nothing was
written, and the commit endpoint still answered 200 with
``published_count: 1`` and cleared the draft cache. The user's edit was
reported as a successful publish and lost.
"""

import os

import ruamel.yaml

from tests.support.utils import temp_folder, temp_yml_file
from visivo.server.project_writer import ProjectWriter


def _read_yaml(path):
    yaml = ruamel.yaml.YAML(typ="safe")
    with open(path) as f:
        return yaml.load(f)


def _write(project_file, config):
    named_children = {
        "defaults": {
            "status": "Modified",
            "file_path": project_file,
            "new_file_path": project_file,
            "type_key": "defaults",
            "config": config,
        }
    }
    writer = ProjectWriter(named_children)
    writer.update_file_contents()
    writer.write()


def test_editing_defaults_is_written_to_the_project_file():
    project_dir = temp_folder()
    project_file = str(
        temp_yml_file(
            {
                "name": "p",
                "defaults": {"source_name": "local-duckdb", "threads": 8},
                "models": [{"name": "m", "sql": "SELECT 1"}],
            },
            name="project.visivo.yml",
            output_dir=project_dir,
        )
    )

    _write(project_file, {"source_name": "local-duckdb", "threads": 4})

    assert _read_yaml(project_file)["defaults"] == {
        "source_name": "local-duckdb",
        "threads": 4,
    }


def test_a_project_with_no_defaults_block_gains_one():
    project_dir = temp_folder()
    project_file = str(
        temp_yml_file(
            {"name": "p", "models": [{"name": "m", "sql": "SELECT 1"}]},
            name="project.visivo.yml",
            output_dir=project_dir,
        )
    )

    _write(project_file, {"source_name": "local-duckdb", "threads": 4})

    assert _read_yaml(project_file)["defaults"] == {
        "source_name": "local-duckdb",
        "threads": 4,
    }


def test_a_removed_default_is_removed_from_the_file():
    """The write is a diff, not a merge — dropping a key must drop the line."""
    project_dir = temp_folder()
    project_file = str(
        temp_yml_file(
            {
                "name": "p",
                "defaults": {"source_name": "local-duckdb", "threads": 8},
                "models": [{"name": "m", "sql": "SELECT 1"}],
            },
            name="project.visivo.yml",
            output_dir=project_dir,
        )
    )

    _write(project_file, {"source_name": "local-duckdb"})

    assert _read_yaml(project_file)["defaults"] == {"source_name": "local-duckdb"}


def test_the_rest_of_the_file_is_untouched():
    """Only the singleton block changes; sibling top-level keys survive."""
    project_dir = temp_folder()
    project_file = str(
        temp_yml_file(
            {
                "name": "p",
                "defaults": {"threads": 8},
                "models": [{"name": "m", "sql": "SELECT 1"}],
            },
            name="project.visivo.yml",
            output_dir=project_dir,
        )
    )

    _write(project_file, {"threads": 2})

    written = _read_yaml(project_file)
    assert written["name"] == "p"
    assert written["models"] == [{"name": "m", "sql": "SELECT 1"}]
    assert written["defaults"] == {"threads": 2}
