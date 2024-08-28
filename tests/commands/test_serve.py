import os
import json
from visivo.commands.serve_phase import app_phase
from visivo.parsers.file_names import PROJECT_FILE_NAME
from visivo.commands.utils import create_file_database
from click.testing import CliRunner
from tests.support.utils import temp_yml_file, temp_folder
from tests.factories.model_factories import ProjectFactory

runner = CliRunner()


def test_serve():
    output_dir = temp_folder()
    project = ProjectFactory()

    create_file_database(url=project.sources[0].url(), output_dir=output_dir)
    tmp = temp_yml_file(
        dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME
    )
    working_dir = os.path.dirname(tmp)

    app = app_phase(
        working_dir=working_dir,
        output_dir=output_dir,
        default_source="source",
        name_filter=None,
        threads=2,
    )

    client = app.test_client()
    response = client.get("/data/project.json")
    response_json = json.loads(response.data)
    assert "project_json" in response_json
