from visivo.commands.run import run
from tests.support.utils import temp_yml_file
from pathlib import Path
from click.testing import CliRunner
from tests.factories.model_factories import ProjectFactory
from visivo.parsers.core_parser import PROJECT_FILE_NAME
import os
from tests.support.utils import temp_folder, create_file_database
import json

runner = CliRunner()


def test_run():
    output_dir = temp_folder()
    project = ProjectFactory()

    create_file_database(url=project.targets[0].url(), output_dir=output_dir)
    tmp = temp_yml_file(dict=json.loads(project.json()), name=PROJECT_FILE_NAME)
    working_dir = os.path.dirname(tmp)

    response = runner.invoke(run, ["-w", working_dir, "-o", output_dir, "-t", "target"])

    assert "Running project" in response.output
    assert response.exit_code == 0


def test_run_with_passed_target():
    output_dir = temp_folder()
    project = ProjectFactory()

    create_file_database(url=project.targets[0].url(), output_dir=output_dir)
    tmp = temp_yml_file(dict=json.loads(project.json()), name=PROJECT_FILE_NAME)
    working_dir = os.path.dirname(tmp)

    response = runner.invoke(
        run,
        ["-w", working_dir, "-o", output_dir, "-t", project.targets[0].json()],
    )

    assert "Running project" in response.output
    assert response.exit_code == 0
