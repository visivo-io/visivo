import os
import json
from visivo.commands.dbt_phase import dbt_phase
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

    working_dir = os.path.dirname(tmp)

    response = runner.invoke(dbt, ["-w", working_dir, "-o", output_dir])

    assert "Refreshed dbt models and sources" in response.output
    assert response.exit_code == 0
    assert os.path.exists(f"{output_dir}/dbt.yml")


def _project_dir(project):
    working_dir = temp_folder()
    tmp = temp_yml_file(
        dict=json.loads(project.model_dump_json(exclude_none=True)),
        name=PROJECT_FILE_NAME,
        output_dir=working_dir,
    )
    return os.path.dirname(tmp)


def test_dbt_without_a_dbt_block_fails_and_names_the_block():
    output_dir = temp_folder()
    working_dir = _project_dir(ProjectFactory(dbt=None))

    response = runner.invoke(dbt, ["-w", working_dir, "-o", output_dir])

    assert response.exit_code != 0
    assert "Refreshed dbt models and sources" not in response.output
    assert "dbt:" in response.output
    assert "enabled: true" in response.output
    assert "https://docs.visivo.io/reference/configuration/Dbt/" in response.output
    assert not os.path.exists(f"{output_dir}/dbt.yml")


def test_dbt_with_a_disabled_dbt_block_fails():
    output_dir = temp_folder()
    working_dir = _project_dir(ProjectFactory(dbt=DbtFactory(enabled=False)))

    response = runner.invoke(dbt, ["-w", working_dir, "-o", output_dir])

    assert response.exit_code != 0
    assert "Refreshed dbt models and sources" not in response.output
    assert "enabled: true" in response.output
