from visivo.commands.test import test
from tests.support.utils import temp_yml_file
from click.testing import CliRunner
from tests.factories.model_factories import ProjectFactory
from visivo.parsers.core_parser import PROJECT_FILE_NAME
import os
from tests.support.utils import temp_folder, create_file_database
import json

runner = CliRunner()


def test_test():
    output_dir = temp_folder()
    project = ProjectFactory()
    create_file_database(url=project.targets[0].url(), output_dir=output_dir)
    tmp = temp_yml_file(dict=json.loads(project.json()), name=PROJECT_FILE_NAME)
    working_dir = os.path.dirname(tmp)
    response = runner.invoke(
        test, ["-o", output_dir, "-w", working_dir, "-t", "target"]
    )
    assert "tests run" in response.output
    assert response.exit_code == 0
