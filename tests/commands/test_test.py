import os
from click.testing import CliRunner
import json
from visivo.commands.test import test
from visivo.parsers.core_parser import PROJECT_FILE_NAME
from visivo.commands.utils import create_file_database
from tests.factories.model_factories import ProjectFactory
from tests.support.utils import temp_folder, temp_yml_file
from tests.factories.model_factories import AlertFactory

runner = CliRunner()


def test_test():
    output_dir = temp_folder()
    project = ProjectFactory()
    create_file_database(url=project.targets[0].url(), output_dir=output_dir)
    tmp = temp_yml_file(
        dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME
    )
    working_dir = os.path.dirname(tmp)
    response = runner.invoke(
        test, ["-o", output_dir, "-w", working_dir, "-t", "target"]
    )
    assert "tests run" in response.output
    assert response.exit_code == 0


def test_test_failure():
    output_dir = temp_folder()
    project = ProjectFactory()
    project.dashboards[0].rows[0].items[0].chart.traces[0].tests = [{"fail": {}}]
    create_file_database(url=project.targets[0].url(), output_dir=output_dir)
    tmp = temp_yml_file(
        dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME
    )
    working_dir = os.path.dirname(tmp)
    response = runner.invoke(
        test, ["-o", output_dir, "-w", working_dir, "-t", "target"]
    )
    assert "tests run" in response.output
    assert response.exit_code == 1


def test_test_alert():
    output_dir = temp_folder()
    alert = AlertFactory()
    project = ProjectFactory(alerts=[alert])
    create_file_database(url=project.targets[0].url(), output_dir=output_dir)
    tmp = temp_yml_file(
        dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME
    )
    working_dir = os.path.dirname(tmp)
    response = runner.invoke(
        test, ["-o", output_dir, "-w", working_dir, "-t", "target", "-a", alert.name]
    )
    assert "tests run" in response.output
    assert "Console Alert Run" in response.output
    assert response.exit_code == 0
