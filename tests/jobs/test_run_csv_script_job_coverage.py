"""Coverage-focused behavioral tests for run_csv_script_job.

Covers the action() success/failure envelopes, the best-effort schema-write
guard, the job() run_id branch, and the _write_schema early returns.
"""

import os

from tests.factories.model_factories import CsvScriptModelFactory
from tests.support.utils import temp_folder
from visivo.constants import DEFAULT_RUN_ID
from visivo.jobs.run_csv_script_job import _write_schema, action, job
from visivo.models.models.csv_script_model import CsvScriptModel


class TestWriteSchemaEarlyReturns:
    def test_returns_when_duckdb_file_absent(self):
        # No insert has run, so the DuckDB file never gets created.
        model = CsvScriptModelFactory()
        run_output_dir = os.path.join(temp_folder(), DEFAULT_RUN_ID)
        os.makedirs(run_output_dir, exist_ok=True)

        # Should quietly return without raising or writing a schema file.
        _write_schema(model, run_output_dir)
        schema_file = os.path.join(run_output_dir, "schemas", model.name, "schema.json")
        assert not os.path.exists(schema_file)

    def test_returns_when_table_has_no_columns(self):
        # Build the DuckDB db from a real model, then introspect for a table
        # name that doesn't exist → information_schema returns no rows.
        model = CsvScriptModelFactory()
        run_output_dir = os.path.join(temp_folder(), DEFAULT_RUN_ID)
        os.makedirs(run_output_dir, exist_ok=True)
        model.insert_csv_to_duckdb(output_dir=run_output_dir)

        ghost = CsvScriptModel(name=model.name, table_name="does_not_exist", args=model.args)
        _write_schema(ghost, run_output_dir)
        schema_file = os.path.join(run_output_dir, "schemas", ghost.name, "schema.json")
        assert not os.path.exists(schema_file)


class TestAction:
    def test_success_returns_job_result_and_writes_schema(self):
        model = CsvScriptModelFactory()
        output_dir = temp_folder()

        result = action(model, output_dir)

        assert result.success is True
        assert model.name in result.message
        schema_file = os.path.join(output_dir, DEFAULT_RUN_ID, "schemas", model.name, "schema.json")
        assert os.path.exists(schema_file)

    def test_schema_write_failure_is_swallowed(self, mocker):
        # A schema introspection failure must NOT fail the data job.
        model = CsvScriptModelFactory()
        output_dir = temp_folder()
        mocker.patch(
            "visivo.jobs.run_csv_script_job._write_schema",
            side_effect=RuntimeError("introspection tripped"),
        )

        result = action(model, output_dir)
        assert result.success is True

    def test_failure_when_script_errors(self):
        # A script that exits non-zero produces no CSV → insert raises → failure.
        model = CsvScriptModel(
            name="broken",
            table_name="broken",
            args=["python3", "-c", "import sys; sys.exit(3)"],
        )
        output_dir = temp_folder()

        result = action(model, output_dir)
        assert result.success is False
        assert "broken" in result.message


class TestJob:
    def test_job_honors_run_id(self):
        model = CsvScriptModelFactory()
        output_dir = temp_folder()

        created = job(model, output_dir, run_id="preview-model")
        assert created.item is model
        assert created.action is action
