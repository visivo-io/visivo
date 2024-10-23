import os
import json
from visivo.commands.dbt import dbt
from visivo.parsers.file_names import PROJECT_FILE_NAME
from visivo.commands.utils import create_file_database
from click.testing import CliRunner
from tests.support.utils import temp_yml_file, temp_folder
from tests.factories.model_factories import DbtFactory, ProjectFactory

runner = CliRunner()


def test_dbt():
    output_dir = temp_folder()
    working_dir = temp_folder()
    project = ProjectFactory(dbt=DbtFactory())

    create_file_database(url=project.sources[0].url(), output_dir=output_dir)
    tmp = temp_yml_file(
        dict=json.loads(project.model_dump_json()),
        name=PROJECT_FILE_NAME,
        output_dir=working_dir,
    )
    temp_yml_file(
        dict={"profile_name": {"outputs": {"target_name": {"type": "snowflake"}}}},
        name="profiles.yml",
        output_dir=working_dir,
    )
    temp_yml_file(dict={}, name="dbt_project.yml", output_dir=working_dir)

    working_dir = os.path.dirname(tmp)

    response = runner.invoke(dbt, ["-w", working_dir, "-o", output_dir])

    assert "Refreshed dbt models and sources" in response.output
    assert response.exit_code == 0
    assert os.path.exists(f"dist/data/trace/data.json")
    assert os.path.exists(f"dist/data/error.json")
    assert os.path.exists(f"dist/data/project_history.json")
    assert os.path.exists(f"dist/data/project.json")
    with open("dist/data/project.json") as project_json:
        assert '"created_at"' in project_json.read()
