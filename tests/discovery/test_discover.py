from visivo.discovery.discover import Discover
from pathlib import Path
from visivo.parsers.core_parser import PROJECT_FILE_NAME
from tests.support.utils import temp_yml_file, temp_folder, temp_file
import os
import pytest
import click
import yaml


def test_Discover_files_single_file():
    project_file = temp_yml_file({}, "project.visivo.yml")
    discover = Discover(
        working_directory=os.path.dirname(project_file), home_directory="tmp"
    )
    assert discover.files == [project_file]


def test_Discover_files_with_home_directory():
    project_file = temp_yml_file({}, "project.visivo.yml")
    profile_file = temp_yml_file({}, ".visivo/profile.yml")
    discover = Discover(
        working_directory=os.path.dirname(project_file),
        home_directory=os.path.dirname(profile_file).replace(".visivo", ""),
    )
    assert discover.files == [project_file, profile_file]
    assert discover.project_file == project_file


def test_Discover_includes_not_exists():
    project_file = temp_yml_file(
        {
            "name": "project",
            "includes": [{"path": "path/to/file/that/does/not/exist.yml"}],
        },
        name=PROJECT_FILE_NAME,
    )
    profile_file = temp_yml_file({}, ".visivo/profile.yml")
    discover = Discover(
        working_directory=os.path.dirname(project_file),
        home_directory=os.path.dirname(profile_file).replace(".visivo", ""),
    )

    with pytest.raises(click.ClickException) as exc_info:
        discover.files

    assert (
        exc_info.value.message
        == f'Invalid "include" in project. "{os.path.dirname(project_file)}/path/to/file/that/does/not/exist.yml" does not exist.'
    )


def test_Core_Parser_includes_file():
    output_dir = temp_folder()
    sub_file = temp_file(
        contents=yaml.dump(
            {
                "targets": [{"name": "import_target_name", "database": "database"}],
            }
        ),
        output_dir=output_dir,
        name="other.yml",
    )
    project_file = temp_file(
        contents=yaml.dump(
            {
                "name": "project",
                "includes": [{"path": "other.yml"}],
            }
        ),
        output_dir=output_dir,
        name=PROJECT_FILE_NAME,
    )
    profile_file = temp_yml_file({}, ".visivo/profile.yml")
    discover = Discover(
        working_directory=os.path.dirname(project_file),
        home_directory=os.path.dirname(profile_file).replace(".visivo", ""),
    )
    assert discover.files == [project_file, sub_file, profile_file]


def test_Core_Parser_includes_git():
    output_dir = temp_folder()
    project_file = temp_file(
        contents=yaml.dump(
            {
                "name": "project",
                "includes": [{"path": "visivo-io/example-include.git@main"}],
            }
        ),
        output_dir=output_dir,
        name=PROJECT_FILE_NAME,
    )
    profile_file = temp_yml_file({}, ".visivo/profile.yml")
    discover = Discover(
        working_directory=os.path.dirname(project_file),
        home_directory=os.path.dirname(profile_file).replace(".visivo", ""),
    )
    git_models_file = Path(
        f"{output_dir}/.visivo_cache/visivo-io/example-include@main/models.yml"
    )
    if os.path.exists(
        f"{output_dir}/.visivo_cache/visivo-io/example-include@main/{PROJECT_FILE_NAME}"
    ):
        git_project_file = Path(
            f"{output_dir}/.visivo_cache/visivo-io/example-include@main/{PROJECT_FILE_NAME}"
        )
    else:
        git_project_file = Path(
            f"{output_dir}/.visivo_cache/visivo-io/example-include@main/visivo_project.yml"
        )

    assert discover.files == [
        project_file,
        git_project_file,
        git_models_file,
        profile_file,
    ]


def test_Core_Parser_includes_git_single_file():
    output_dir = temp_folder()
    project_file = temp_file(
        contents=yaml.dump(
            {
                "name": "project",
                "includes": [
                    {"path": "visivo-io/example-include.git@main -- models.yml"}
                ],
            }
        ),
        output_dir=output_dir,
        name=PROJECT_FILE_NAME,
    )
    profile_file = temp_yml_file({}, ".visivo/profile.yml")
    discover = Discover(
        working_directory=os.path.dirname(project_file),
        home_directory=os.path.dirname(profile_file).replace(".visivo", ""),
    )
    git_models_file = Path(
        f"{output_dir}/.visivo_cache/visivo-io/example-include@main/models.yml"
    )

    assert discover.files == [
        project_file,
        git_models_file,
        profile_file,
    ]
