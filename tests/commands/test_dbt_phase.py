import os
import json
import yaml
import pytest
import click
from visivo.commands.dbt_phase import dbt_phase
from visivo.models.sources.snowflake_source import SnowflakeSource
from visivo.parsers.file_names import PROJECT_FILE_NAME
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
                        "extra_key": "extra_value",
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
        SnowflakeSource(**dbt_content["sources"][0])
        assert dbt_content["models"][0]["source"] == "ref(profile_name_target_name)"


def test_dbt_with_set_profile_and_target():
    output_dir = temp_folder()
    working_dir = temp_folder()
    project = ProjectFactory(dbt=DbtFactory())
    setup_dbt(project, working_dir)

    dbt_phase(
        working_dir=working_dir,
        output_dir=output_dir,
        dbt_profile="profile_name",
        dbt_target="target_name",
    )

    assert os.path.exists(f"{output_dir}/dbt.yml")
    with open(f"{output_dir}/dbt.yml", "r") as file:
        dbt_content = yaml.safe_load(file)
        assert dbt_content["models"][0]["source"] == "ref(profile_name_target_name)"


def test_dbt_with_missing_profile():
    output_dir = temp_folder()
    working_dir = temp_folder()
    project = ProjectFactory(dbt=DbtFactory())
    setup_dbt(project, working_dir)

    with pytest.raises(click.ClickException) as exc_info:
        dbt_phase(
            working_dir=working_dir,
            output_dir=output_dir,
            dbt_profile="does_not_exist",
            dbt_target=None,
        )
        assert exc_info.value.message == f"Profile 'does_not_exist' not found in profiles.yml"


def test_dbt_with_missing_target():
    output_dir = temp_folder()
    working_dir = temp_folder()
    project = ProjectFactory(dbt=DbtFactory())
    setup_dbt(project, working_dir)
    with pytest.raises(click.ClickException) as exc_info:
        dbt_phase(
            working_dir=working_dir,
            output_dir=output_dir,
            dbt_profile=None,
            dbt_target="does_not_exist",
        )
        assert exc_info.value.message == f"Target'does_not_exist' not found in profiles.yml"


def test_dbt_with_missing_manifest():
    output_dir = temp_folder()
    working_dir = temp_folder()
    project = ProjectFactory(dbt=DbtFactory())
    setup_dbt(project, working_dir)
    os.remove(f"{working_dir}/target/manifest.json")

    with pytest.raises(click.ClickException) as exc_info:
        dbt_phase(
            working_dir=working_dir,
            output_dir=output_dir,
            dbt_profile="profile_name",
            dbt_target="target_name",
        )
        assert (
            exc_info.value.message
            == f"Manifest file not found at '{working_dir}/target/manifest.json'. You might need to run dbt."
        )


def test_dbt_with_unsupported_source_type():
    output_dir = temp_folder()
    working_dir = temp_folder()
    project = ProjectFactory(dbt=DbtFactory())
    setup_dbt(project, working_dir)
    temp_yml_file(
        dict={
            "profile_name": {
                "target": "target_name",
                "outputs": {
                    "target_name": {
                        "type": "unsupported",
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
    with pytest.raises(click.ClickException) as exc_info:
        dbt_phase(
            working_dir=working_dir,
            output_dir=output_dir,
            dbt_profile="profile_name",
            dbt_target="target_name",
        )
        assert (
            exc_info.value.message
            == f"Target type 'unsupported' is not supported.  Only ['postgresql', 'mysql', 'sqlite', 'snowflake'] are supported."
        )
