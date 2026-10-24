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


def setup_dbt(project, working_dir, dbt_dir=None, profiles_dir=None):
    dbt_dir = dbt_dir or working_dir
    profiles_dir = profiles_dir or working_dir
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
                        "account": "{{ env_var('ACCOUNT') }}",
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
        output_dir=profiles_dir,
    )
    temp_yml_file(
        dict={"target-path": "target", "profile": "profile_name"},
        name="dbt_project.yml",
        output_dir=dbt_dir,
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
        output_dir=f"{dbt_dir}/target",
    )


@pytest.mark.parametrize("project_location", ["dbt", "dbt/dbt_project.yml", "dbt/"])
@pytest.mark.parametrize("profiles_location", [None, "conf", "conf/profiles.yml"])
def test_dbt_locations_accept_a_directory_or_a_file_path(project_location, profiles_location):
    output_dir = temp_folder()
    working_dir = temp_folder()
    project = ProjectFactory(
        dbt=DbtFactory(
            dbt_project_yml_location=project_location, profiles_yml_location=profiles_location
        )
    )
    setup_dbt(
        project,
        working_dir,
        dbt_dir=f"{working_dir}/dbt",
        profiles_dir=f"{working_dir}/conf" if profiles_location else working_dir,
    )

    dbt_phase(working_dir=working_dir, output_dir=output_dir, dbt_profile=None, dbt_target=None)

    with open(f"{output_dir}/dbt.yml", "r") as file:
        dbt_content = yaml.safe_load(file)
    assert dbt_content["models"][0]["source"] == "ref(profile_name_target_name)"


def test_dbt_project_in_the_working_directory_by_file_name():
    output_dir = temp_folder()
    working_dir = temp_folder()
    project = ProjectFactory(dbt=DbtFactory(dbt_project_yml_location="dbt_project.yml"))
    setup_dbt(project, working_dir)

    dbt_phase(working_dir=working_dir, output_dir=output_dir, dbt_profile=None, dbt_target=None)

    assert os.path.exists(f"{output_dir}/dbt.yml")


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


def test_dbt_with_versions():
    output_dir = temp_folder()
    working_dir = temp_folder()
    project = ProjectFactory(dbt=DbtFactory())
    setup_dbt(project, working_dir)

    # Create schema.yml with versioned model
    temp_file(
        contents=json.dumps(
            {
                "nodes": {
                    "model.project_name.fact_transaction.v1": {
                        "database": "RAW",
                        "schema": "salesmart",
                        "name": "fact_transaction",
                        "version": 1,
                        "latest_version": 2,
                    },
                    "model.project_name.fact_transaction.v2": {
                        "database": "RAW",
                        "schema": "salesmart",
                        "name": "fact_transaction",
                        "version": 2,
                        "latest_version": 2,
                    },
                }
            }
        ),
        name="manifest.json",
        output_dir=f"{working_dir}/target",
    )

    # Run dbt phase
    dbt_phase(
        working_dir=working_dir,
        output_dir=output_dir,
        dbt_profile="profile_name",
        dbt_target="target_name",
    )

    # Check output dbt.yml has 3 models for the versioned fact_transaction
    with open(f"{output_dir}/dbt.yml") as f:
        dbt_config = yaml.safe_load(f)
        models = dbt_config["models"]
        fact_models = [m for m in models if "fact_transaction" in m["name"]]

        assert len(fact_models) == 3
        assert any(m["name"] == "fact_transaction" for m in fact_models)
        assert any(m["name"] == "fact_transaction_v1" for m in fact_models)
        assert any(m["name"] == "fact_transaction_v2" for m in fact_models)


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
