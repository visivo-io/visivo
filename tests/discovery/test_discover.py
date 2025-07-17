from visivo.discovery.discover import Discover
from pathlib import Path
from visivo.parsers.file_names import PROJECT_FILE_NAME
from tests.support.utils import temp_yml_file, temp_folder, temp_file
import os
import pytest
import click
import yaml
import tempfile
import shutil


def test_Discover_files_single_file():
    project_file = temp_yml_file({}, "project.visivo.yml")
    discover = Discover(
        working_dir=os.path.dirname(project_file),
        home_dir="tmp",
        output_dir="tmp",
    )
    assert discover.files == [project_file]


def test_Discover_files_with_home_dir():
    project_file = temp_yml_file({}, "project.visivo.yml")
    profile_file = temp_yml_file({}, ".visivo/profile.yml")
    discover = Discover(
        working_dir=os.path.dirname(project_file),
        output_dir=os.path.dirname(project_file),
        home_dir=os.path.dirname(profile_file).replace(".visivo", ""),
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
        working_dir=os.path.dirname(project_file),
        output_dir=os.path.dirname(project_file),
        home_dir=os.path.dirname(profile_file).replace(".visivo", ""),
    )

    with pytest.raises(click.ClickException) as exc_info:
        discover.files

    assert (
        exc_info.value.message
        == f'Invalid "include" in project. "{os.path.dirname(project_file)}/path/to/file/that/does/not/exist.yml" referenced in "{project_file}" does not exist.'
    )


def test_Core_Parser_includes_file():
    output_dir = temp_folder()
    sub_file = temp_file(
        contents=yaml.dump(
            {
                "sources": [{"name": "import_source_name", "database": "database"}],
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
        working_dir=os.path.dirname(project_file),
        output_dir=output_dir,
        home_dir=os.path.dirname(profile_file).replace(".visivo", ""),
    )
    assert discover.files == [project_file, sub_file, profile_file]


def test_Core_Parser_includes_dbt():
    output_dir = temp_folder()
    dbt_file = temp_file(
        contents=yaml.dump(
            {
                "sources": [{"name": "import_source_name", "database": "database"}],
            }
        ),
        output_dir=output_dir,
        name="dbt.yml",
    )
    project_file = temp_file(
        contents=yaml.dump(
            {
                "name": "project",
                "dbt": {"enabled": True},
            }
        ),
        output_dir=output_dir,
        name=PROJECT_FILE_NAME,
    )
    profile_file = temp_yml_file({}, ".visivo/profile.yml")
    discover = Discover(
        working_dir=os.path.dirname(project_file),
        output_dir=output_dir,
        home_dir=os.path.dirname(profile_file).replace(".visivo", ""),
    )
    assert discover.files == [project_file, dbt_file, profile_file]


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
        working_dir=os.path.dirname(project_file),
        output_dir=output_dir,
        home_dir=os.path.dirname(profile_file).replace(".visivo", ""),
    )
    git_models_file = Path(f"{output_dir}/.visivo_cache/visivo-io/example-include@main/models.yml")
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
                "includes": [{"path": "visivo-io/example-include.git@main -- models.yml"}],
            }
        ),
        output_dir=output_dir,
        name=PROJECT_FILE_NAME,
    )
    profile_file = temp_yml_file({}, ".visivo/profile.yml")
    discover = Discover(
        working_dir=os.path.dirname(project_file),
        output_dir=output_dir,
        home_dir=os.path.dirname(profile_file).replace(".visivo", ""),
    )
    git_models_file = Path(f"{output_dir}/.visivo_cache/visivo-io/example-include@main/models.yml")

    assert discover.files == [
        project_file,
        git_models_file,
        profile_file,
    ]


def test_Discover_directory_inclusion_recursive():
    """Test recursive directory inclusion (default behavior)."""
    # Create a temporary directory structure
    temp_dir = tempfile.mkdtemp()
    try:
        # Create project file
        project_content = {"name": "test_project", "includes": [{"path": "config/"}]}
        project_file = os.path.join(temp_dir, PROJECT_FILE_NAME)
        with open(project_file, "w") as f:
            yaml.dump(project_content, f)

        # Create config directory with nested structure
        config_dir = os.path.join(temp_dir, "config")
        os.makedirs(config_dir)
        os.makedirs(os.path.join(config_dir, "subdir"))

        # Create YAML files at different levels
        config_file1 = os.path.join(config_dir, "models.yml")
        with open(config_file1, "w") as f:
            yaml.dump({"models": []}, f)

        config_file2 = os.path.join(config_dir, "sources.yml")
        with open(config_file2, "w") as f:
            yaml.dump({"sources": []}, f)

        nested_file = os.path.join(config_dir, "subdir", "traces.yml")
        with open(nested_file, "w") as f:
            yaml.dump({"traces": []}, f)

        # Create a non-YAML file that should be ignored
        txt_file = os.path.join(config_dir, "readme.txt")
        with open(txt_file, "w") as f:
            f.write("This should be ignored")

        discover = Discover(working_dir=temp_dir, output_dir=temp_dir, home_dir=temp_dir)

        files = discover.files
        file_paths = [str(f) for f in files]

        # Should include project file and all YAML files recursively
        assert str(Path(project_file)) in file_paths
        assert str(Path(config_file1)) in file_paths
        assert str(Path(config_file2)) in file_paths
        assert str(Path(nested_file)) in file_paths
        assert str(Path(txt_file)) not in file_paths

    finally:
        shutil.rmtree(temp_dir)


def test_Discover_directory_inclusion_depth_zero():
    """Test directory inclusion with depth=0 (current directory only)."""
    temp_dir = tempfile.mkdtemp()
    try:
        # Create project file
        project_content = {"name": "test_project", "includes": [{"path": "config/", "depth": 0}]}
        project_file = os.path.join(temp_dir, PROJECT_FILE_NAME)
        with open(project_file, "w") as f:
            yaml.dump(project_content, f)

        # Create config directory with nested structure
        config_dir = os.path.join(temp_dir, "config")
        os.makedirs(config_dir)
        os.makedirs(os.path.join(config_dir, "subdir"))

        # Create YAML files at different levels
        config_file = os.path.join(config_dir, "models.yml")
        with open(config_file, "w") as f:
            yaml.dump({"models": []}, f)

        nested_file = os.path.join(config_dir, "subdir", "traces.yml")
        with open(nested_file, "w") as f:
            yaml.dump({"traces": []}, f)

        discover = Discover(working_dir=temp_dir, output_dir=temp_dir, home_dir=temp_dir)

        files = discover.files
        file_paths = [str(f) for f in files]

        # Should include project file and only top-level YAML files
        assert str(Path(project_file)) in file_paths
        assert str(Path(config_file)) in file_paths
        assert str(Path(nested_file)) not in file_paths  # Should be excluded due to depth=0

    finally:
        shutil.rmtree(temp_dir)


def test_Discover_directory_inclusion_with_exclusions():
    """Test directory inclusion with exclusion patterns."""
    temp_dir = tempfile.mkdtemp()
    try:
        # Create project file with exclusions
        project_content = {
            "name": "test_project",
            "includes": [
                {"path": "config/", "exclusions": ["*.config.yml", "*/temp/*", "ignore_me.yml"]}
            ],
        }
        project_file = os.path.join(temp_dir, PROJECT_FILE_NAME)
        with open(project_file, "w") as f:
            yaml.dump(project_content, f)

        # Create config directory with nested structure
        config_dir = os.path.join(temp_dir, "config")
        os.makedirs(config_dir)
        os.makedirs(os.path.join(config_dir, "temp"))

        # Create YAML files that should be included
        good_file1 = os.path.join(config_dir, "models.yml")
        with open(good_file1, "w") as f:
            yaml.dump({"models": []}, f)

        good_file2 = os.path.join(config_dir, "sources.yml")
        with open(good_file2, "w") as f:
            yaml.dump({"sources": []}, f)

        # Create files that should be excluded
        config_file = os.path.join(config_dir, "app.config.yml")  # Should be excluded by pattern
        with open(config_file, "w") as f:
            yaml.dump({"config": {}}, f)

        ignore_file = os.path.join(config_dir, "ignore_me.yml")  # Should be excluded by name
        with open(ignore_file, "w") as f:
            yaml.dump({"ignore": {}}, f)

        temp_file = os.path.join(
            config_dir, "temp", "temp.yml"
        )  # Should be excluded by path pattern
        with open(temp_file, "w") as f:
            yaml.dump({"temp": {}}, f)

        discover = Discover(working_dir=temp_dir, output_dir=temp_dir, home_dir=temp_dir)

        files = discover.files
        file_paths = [str(f) for f in files]

        # Should include project file and non-excluded YAML files
        assert str(Path(project_file)) in file_paths
        assert str(Path(good_file1)) in file_paths
        assert str(Path(good_file2)) in file_paths

        # Should exclude files matching exclusion patterns
        assert str(Path(config_file)) not in file_paths
        assert str(Path(ignore_file)) not in file_paths
        assert str(Path(temp_file)) not in file_paths

    finally:
        shutil.rmtree(temp_dir)
