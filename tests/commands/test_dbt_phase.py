import os
import json
import yaml
from visivo.commands.dbt_phase import dbt_phase
from visivo.commands.dbt import dbt
from visivo.parsers.file_names import PROJECT_FILE_NAME
from visivo.commands.utils import create_file_database
from click.testing import CliRunner
from tests.support.utils import temp_file, temp_yml_file, temp_folder
from tests.factories.model_factories import DbtFactory, ProjectFactory

runner = CliRunner()


def setup_dbt(project, working_dir):
    temp_yml_file(
        dict=json.loads(project.model_dump_json()),
        name=PROJECT_FILE_NAME,
        output_dir=working_dir,
    )
    temp_yml_file(
        dict={
            "profile_name": {
                "target": "target_name",
                "outputs": {
                    "target_name": {
                        "type": "snowflake",
                        "account": "{{env_var('ACCOUNT')}}",
                        "username": "username",
                        "password": "password",
                        "schema": "schema",
                        "database": "database",
                        "threads": 8,
                        "warehouse": "warehouse",
                        "role": "role",
                    }
                },
            }
        },
        name="profiles.yml",
        output_dir=working_dir,
    )
    temp_yml_file(
        dict={"target-path": "target", "profile": "profile_name"},
        name="dbt_project.yml",
        output_dir=working_dir,
    )

    temp_file(
        contents=json.dumps(
            {
                "nodes": {
                    "model.project_name.fact_transaction": {
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


def test_dbt_with_defaults():
    output_dir = temp_folder()
    working_dir = temp_folder()
    project = ProjectFactory(dbt=DbtFactory())
    setup_dbt(project, working_dir)

    dbt_phase(
        working_dir=working_dir,
        output_dir=output_dir,
        dbt_profile=None,
        dbt_target=None,
    )

    assert os.path.exists(f"{output_dir}/dbt.yml")
    with open(f"{output_dir}/dbt.yml", "r") as file:
        dbt_content = yaml.safe_load(file)
        assert dbt_content["models"][0]["source"] == "ref(dbt_profile_name_target_name)"
