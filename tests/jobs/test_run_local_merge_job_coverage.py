"""Coverage-focused behavioral tests for run_local_merge_job.

Covers action() success/failure, the best-effort schema-write guard, the job()
run_id branch, and the _write_schema early return when the DuckDB file is
absent.
"""

import os

import polars as pl

from tests.support.utils import temp_folder
from visivo.constants import DEFAULT_RUN_ID
from visivo.jobs.run_local_merge_job import _write_schema, action, job
from visivo.models.models.local_merge_model import LocalMergeModel
from visivo.models.models.sql_model import SqlModel
from visivo.models.sources.postgresql_source import PostgresqlSource


def _merge_model():
    source = PostgresqlSource(database="test", type="postgresql")
    return LocalMergeModel(
        name="merged_model",
        sql="SELECT * FROM model1.model",
        models=[SqlModel(name="model1", sql="SELECT * FROM table1", source=source)],
    )


class TestWriteSchemaEarlyReturn:
    def test_returns_when_duckdb_file_absent(self):
        model = _merge_model()
        run_output_dir = os.path.join(temp_folder(), DEFAULT_RUN_ID)
        os.makedirs(run_output_dir, exist_ok=True)

        # No merge has been run, so the DuckDB db file doesn't exist yet.
        _write_schema(model, run_output_dir, model.dag())
        schema_file = os.path.join(run_output_dir, "schemas", model.name, "schema.json")
        assert not os.path.exists(schema_file)


class TestAction:
    def test_success_writes_schema(self, mocker):
        mocker.patch(
            "visivo.models.sources.postgresql_source.PostgresqlSource.read_sql",
            return_value=pl.DataFrame({"id": [1, 2], "label": ["a", "b"]}),
        )
        model = _merge_model()
        dag = model.dag()
        output_dir = temp_folder()

        result = action(model, output_dir, dag)

        assert result.success is True
        assert "merged_model" in result.message
        schema_file = os.path.join(output_dir, DEFAULT_RUN_ID, "schemas", model.name, "schema.json")
        assert os.path.exists(schema_file)

    def test_schema_write_failure_is_swallowed(self, mocker):
        mocker.patch(
            "visivo.models.sources.postgresql_source.PostgresqlSource.read_sql",
            return_value=pl.DataFrame({"id": [1, 2]}),
        )
        mocker.patch(
            "visivo.jobs.run_local_merge_job._write_schema",
            side_effect=RuntimeError("introspection tripped"),
        )
        model = _merge_model()
        output_dir = temp_folder()

        result = action(model, output_dir, model.dag())
        assert result.success is True

    def test_failure_when_merge_raises(self, mocker):
        mocker.patch(
            "visivo.models.models.local_merge_model.LocalMergeModel.insert_duckdb_data",
            side_effect=RuntimeError("merge blew up"),
        )
        model = _merge_model()
        output_dir = temp_folder()

        result = action(model, output_dir, model.dag())
        assert result.success is False
        assert "merged_model" in result.message


class TestJob:
    def test_job_honors_run_id(self):
        model = _merge_model()
        dag = model.dag()
        output_dir = temp_folder()

        created = job(dag, output_dir, model, run_id="preview-merge")
        assert created.item is model
        assert created.action is action
