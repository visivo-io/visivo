import os
import json
from tests.support.utils import temp_file, temp_yml_file, temp_folder
from click.testing import CliRunner
from visivo.commands.deploy import deploy
from visivo.server.hot_reload_server import HotReloadServer
from visivo.parsers.file_names import PROJECT_FILE_NAME, PROFILE_FILE_NAME
from visivo.commands.utils import create_file_database
from tests.factories.model_factories import ProjectFactory

runner = CliRunner()


def get_test_port():
    """Get an available port for testing"""
    return HotReloadServer.find_available_port()


def test_deploy_with_no_profile():
    output_dir = temp_folder()
    project = ProjectFactory()
    port = get_test_port()
    create_file_database(url=project.sources[0].url(), output_dir=output_dir)
    tmp = temp_yml_file(dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME)
    working_dir = os.path.dirname(tmp)
    temp_file(PROFILE_FILE_NAME, "key: value", working_dir + "/.visivo")

    response = runner.invoke(
        deploy,
        [
            "-w",
            working_dir,
            "-o",
            output_dir,
            "-s",
            "stage",
            "-h",
            f"http://localhost:{port}",
            "-u",
            working_dir,
        ],
    )

    assert "not present or token not present in" in response.output
    assert response.exit_code == 1


def test_deploy_with_whitespace_stage():
    output_dir = temp_folder()
    project = ProjectFactory()

    create_file_database(url=project.sources[0].url(), output_dir=output_dir)
    tmp = temp_yml_file(dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME)
    working_dir = os.path.dirname(tmp)

    port = get_test_port()

    response = runner.invoke(
        deploy,
        [
            "-w",
            working_dir,
            "-o",
            output_dir,
            "-s",
            " ",
            "-h",
            f"http://localhost:{port}",
            "-u",
            working_dir,
        ],
    )

    assert "Only whitespace is not permitted for stage name." in response.output
    assert response.exit_code == 2


def test_deploy_with_symbol_stage():
    output_dir = temp_folder()
    project = ProjectFactory()

    create_file_database(url=project.sources[0].url(), output_dir=output_dir)
    tmp = temp_yml_file(dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME)
    working_dir = os.path.dirname(tmp)

    port = get_test_port()

    response = runner.invoke(
        deploy,
        [
            "-w",
            working_dir,
            "-o",
            output_dir,
            "-s",
            "/",
            "-h",
            f"http://localhost:{port}",
            "-u",
            working_dir,
        ],
    )

    assert (
        "Only alphanumeric, whitespace, and '\"-_ characters permitted for stage name."
        in response.output
    )
    assert response.exit_code == 2
