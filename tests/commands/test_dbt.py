import os
import json
from visivo.commands.dbt import dbt
from visivo.parsers.file_names import PROJECT_FILE_NAME
from visivo.commands.utils import create_file_database
from click.testing import CliRunner
from tests.support.utils import temp_file, temp_yml_file, temp_folder
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
        dict={
            "profile_name": {
                "outputs": {
                    "target_name": {
                        "type": "snowflake",
                        "account": "account",
                        "username": "username",
                        "password": "password",
                        "schema": "schema",
                        "database": "database",
                        "threads": 8,
                        "warehouse": "warehouse",
                        "role": "role",
                    }
                }
            }
        },
        name="profiles.yml",
        output_dir=working_dir,
    )
    temp_yml_file(
        dict={"target-path": "target"}, name="dbt_project.yml", output_dir=working_dir
    )

    temp_file(
        contents=json.dumps(
            {
                "nodes": {
                    "model.visivo_qa.fact_transaction": {
                        "database": "RAW",
                        "schema": "salesmart",
                        "name": "fact_transaction",
                    }
                }
            }
        ),
        name="manifest.json",
        output_dir=f"{working_dir}/target",
    )

    working_dir = os.path.dirname(tmp)

    response = runner.invoke(dbt, ["-w", working_dir, "-o", output_dir])

    assert "Refreshed dbt models and sources" in response.output
    assert response.exit_code == 0
    assert os.path.exists(f"{output_dir}/dbt.yml")
