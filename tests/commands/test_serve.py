import os
import json
from visivo.commands.serve import app_phase
from visivo.parsers.core_parser import PROJECT_FILE_NAME
from visivo.commands.utils import create_file_database
from click.testing import CliRunner
from tests.support.utils import temp_yml_file, temp_folder
from tests.factories.model_factories import ProjectFactory

runner = CliRunner()


def test_serve():
    output_dir = temp_folder()
    project = ProjectFactory()

    create_file_database(url=project.targets[0].url(), output_dir=output_dir)
    tmp = temp_yml_file(
        dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME
    )
    working_dir = os.path.dirname(tmp)

    app = app_phase(
        working_dir=working_dir,
        output_dir=output_dir,
        default_target="target",
    )

    client = app.test_client()
    response = client.get("/api/projects/")
    response_json = json.loads(response.data)
    assert "project_json" in response_json

    response = client.get("/api/traces/")
    response_json = json.loads(response.data)
    assert "id" in response_json[0]
    assert "name" in response_json[0]
    assert "signed_data_file_url" in response_json[0]
