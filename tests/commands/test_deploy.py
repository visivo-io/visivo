import os
import json
import yaml
from visivo.commands.deploy import deploy
from tests.support.utils import temp_yml_file
from pathlib import Path
from click.testing import CliRunner
from tests.factories.model_factories import ProjectFactory
from visivo.parsers.core_parser import PROJECT_FILE_NAME, PROFILE_FILE_NAME
from tests.support.utils import temp_folder, create_file_database

runner = CliRunner()


def test_deploy_with_no_profile():
    output_dir = temp_folder()
    project = ProjectFactory()

    create_file_database(url=project.targets[0].url(), output_dir=output_dir)
    tmp = temp_yml_file(dict=json.loads(project.json()), name=PROJECT_FILE_NAME)
    working_dir = os.path.dirname(tmp)

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
            "http://localhost:8000",
            "-u",
            working_dir,
        ],
    )

    assert "not present or token not present in" in response.output
    assert response.exit_code == 1
