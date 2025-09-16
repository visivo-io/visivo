import os
import json
from tests.factories.model_factories import SourceFactory
from tests.support.utils import temp_folder
from visivo.commands.utils import create_file_database
from visivo.jobs.run_source_schema_job import job, action


def test_success_action():
    output_dir = temp_folder()
    source = SourceFactory(database=f"{output_dir}/test.sqlite")

    create_file_database(url=source.url(), output_dir=output_dir)

    job_result = action(source, output_dir=output_dir)
    assert job_result.success == True
    assert "Built schema for source" in job_result.message
    assert "tables" in job_result.message
    assert "columns" in job_result.message


def test_failure_action():
    output_dir = temp_folder()
    source = SourceFactory(database=f"http://localhost:8080/test.sqlite")

    job_result = action(source, output_dir=output_dir)
    assert job_result.success == False
    assert "Failed to build schema for source" in job_result.message
    assert "Schema building error" in job_result.message


def test_schema_file_creation():
    """Test that schema files are properly created and stored."""
    output_dir = temp_folder()
    source = SourceFactory(database=f"{output_dir}/test.sqlite")

    create_file_database(url=source.url(), output_dir=output_dir)

    job_result = action(source, output_dir=output_dir)
    assert job_result.success == True

    # Check that schema file was created
    schema_file = f"{output_dir}/schemas/{source.name}/schema.json"
    assert os.path.exists(schema_file)

    # Check schema file contents
    with open(schema_file, "r") as f:
        schema_data = json.load(f)

    assert schema_data["source_name"] == source.name
    assert schema_data["source_type"] == source.type
    assert "generated_at" in schema_data
    assert "tables" in schema_data
    assert "sqlglot_schema" in schema_data
    assert "metadata" in schema_data


def test_table_filtering():
    """Test that table_names parameter filters tables correctly."""
    output_dir = temp_folder()
    source = SourceFactory(database=f"{output_dir}/test.sqlite")

    create_file_database(url=source.url(), output_dir=output_dir)

    # Test with specific table names (even though SQLite test DB might be empty)
    job_result = action(source, table_names=["specific_table"], output_dir=output_dir)
    assert job_result.success == True

    # The job should succeed even if no tables match the filter
    assert "Built schema for source" in job_result.message


def test_job_creation():
    """Test that job function creates proper Job instances."""
    output_dir = temp_folder()
    source = SourceFactory(database=f"{output_dir}/test.sqlite")

    job_instance = job(source, table_names=["test_table"], output_dir=output_dir)

    assert job_instance.item == source
    assert job_instance.source == source
    assert job_instance.action == action
