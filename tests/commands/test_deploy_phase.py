import os
import json
from tests.factories.model_factories import ProjectFactory
from tests.support.utils import temp_file, temp_folder, temp_yml_file
from visivo.commands.deploy_phase import deploy_phase
from visivo.commands.utils import create_file_database
from visivo.parsers.file_names import PROFILE_FILE_NAME, PROJECT_FILE_NAME


def test_deploy_success(requests_mock, capsys):
    output_dir = temp_folder()
    project = ProjectFactory()
    create_file_database(url=project.targets[0].url(), output_dir=output_dir)

    tmp = temp_yml_file(dict=json.loads('{"name": "name"}'), name=PROJECT_FILE_NAME)
    working_dir = os.path.dirname(tmp)
    temp_file(PROFILE_FILE_NAME, "token: value", working_dir + "/.visivo")

    requests_mock.post(
        "http://host/api/projects/",
        json={"name": "name", "id": "id", "url": "/url"},
        status_code=201,
    )
    url = deploy_phase(
        stage="stage",
        working_dir=working_dir,
        user_dir=working_dir,
        output_dir=output_dir,
        host="http://host",
    )
    assert "/url" == url
