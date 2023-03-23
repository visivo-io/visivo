from visivo.discovery.discover import Discover
from pathlib import Path
from tests.support.utils import temp_yml_file
import os


def test_Discover_files_single_file():
    project_file = temp_yml_file({}, "visivo_project.yml")
    discover = Discover(
        working_directory=os.path.dirname(project_file), home_directory="tmp"
    )
    assert discover.files() == [project_file]


def test_Discover_files_with_home_directory():
    project_file = temp_yml_file({}, "visivo_project.yml")
    profile_file = temp_yml_file({}, ".visivo/profile.yml")
    discover = Discover(
        working_directory=os.path.dirname(project_file),
        home_directory=os.path.dirname(profile_file).replace(".visivo", ""),
    )
    assert discover.files() == [profile_file, project_file]
