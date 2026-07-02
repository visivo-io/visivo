"""Coverage-focused behavioral tests for run_sql_model_job.

Covers the no-cache stored-schema conversion (nested + flat), the
model_query_and_schema_action success/failure envelopes, the schema_only_action
failure envelope, the _get_error_message helper, and the job() table-reference
branch that promotes a schema-only model to a data model.
"""

import json
import os

from tests.support.utils import temp_folder
from visivo.constants import DEFAULT_RUN_ID
from visivo.jobs.run_sql_model_job import (
    _build_and_write_schema,
    _get_error_message,
    model_query_and_schema_action,
    schema_only_action,
    job,
)
from visivo.models.item import Item
from visivo.models.dashboard import Dashboard
from visivo.models.project import Project
from visivo.models.row import Row
from visivo.models.models.sql_model import SqlModel
from visivo.models.sources.sqlite_source import SqliteSource
from visivo.models.table import Table


def _project(model, source, dashboards=None):
    return Project(
        name="p",
        sources=[source],
        models=[model],
        dashboards=dashboards or [],
    )


class TestGetErrorMessage:
    def test_uses_message_attribute_when_present(self):
        class WithMessage(Exception):
            message = "friendly message"

        assert _get_error_message(WithMessage()) == "friendly message"

    def test_falls_back_to_repr(self):
        assert "boom" in _get_error_message(ValueError("boom"))


def _write_source_schema(output_dir, source_name, sqlglot_schema, default_schema=None):
    source_schema_dir = os.path.join(output_dir, DEFAULT_RUN_ID, "schemas", source_name)
    os.makedirs(source_schema_dir, exist_ok=True)
    with open(os.path.join(source_schema_dir, "schema.json"), "w") as fp:
        json.dump(
            {"sqlglot_schema": sqlglot_schema, "metadata": {"default_schema": default_schema}},
            fp,
        )


class TestBuildAndWriteSchemaStoredConversion:
    def test_converts_flat_stored_source_schema(self):
        """A flat stored schema ({table: {col: type}}) resolves query columns."""
        source = SqliteSource(name="source", database=":memory:", type="sqlite")
        model = SqlModel(name="orders", sql="SELECT id, name FROM users", source="ref(source)")
        output_dir = temp_folder()
        _write_source_schema(output_dir, source.name, {"users": {"id": "INT", "name": "VARCHAR"}})

        result = _build_and_write_schema(model, source, output_dir)

        model_hash = model.name_hash()
        assert set(result[model_hash].keys()) == {"id", "name"}

    def test_converts_nested_stored_source_schema(self):
        """A nested stored schema ({schema: {table: {col: type}}}) resolves via
        the metadata default_schema."""
        source = SqliteSource(name="source", database=":memory:", type="sqlite")
        model = SqlModel(name="orders", sql="SELECT col1 FROM orders", source="ref(source)")
        output_dir = temp_folder()
        _write_source_schema(
            output_dir,
            source.name,
            {"EDW": {"orders": {"col1": "INT"}}},
            default_schema="EDW",
        )

        result = _build_and_write_schema(model, source, output_dir)

        model_hash = model.name_hash()
        assert "col1" in result[model_hash]

    def test_no_stored_schema_falls_back_to_empty(self):
        """With no stored source schema, the build still succeeds (empty schema)."""
        source = SqliteSource(name="source", database=":memory:", type="sqlite")
        model = SqlModel(name="orders", sql="SELECT 1 AS id", source="ref(source)")
        output_dir = temp_folder()

        result = _build_and_write_schema(model, source, output_dir)
        assert model.name_hash() in result


class TestModelQueryAndSchemaAction:
    def test_success_writes_parquet_and_schema(self):
        source = SqliteSource(name="source", database=":memory:", type="sqlite")
        model = SqlModel(name="orders", sql="SELECT 1 AS id, 'x' AS name", source="ref(source)")
        dag = _project(model, source).dag()
        output_dir = temp_folder()

        result = model_query_and_schema_action(model, dag, output_dir)

        assert result.success is True
        schema_file = os.path.join(output_dir, DEFAULT_RUN_ID, "schemas", model.name, "schema.json")
        assert os.path.exists(schema_file)

    def test_failure_when_query_references_missing_table(self):
        source = SqliteSource(name="source", database=":memory:", type="sqlite")
        model = SqlModel(
            name="orders", sql="SELECT * FROM table_that_does_not_exist", source="ref(source)"
        )
        dag = _project(model, source).dag()
        output_dir = temp_folder()

        result = model_query_and_schema_action(model, dag, output_dir)

        assert result.success is False
        assert "orders" in result.message


class TestSchemaOnlyAction:
    def test_success(self):
        source = SqliteSource(name="source", database=":memory:", type="sqlite")
        model = SqlModel(name="orders", sql="SELECT 1 AS id", source="ref(source)")
        dag = _project(model, source).dag()
        output_dir = temp_folder()

        result = schema_only_action(model, dag, output_dir)

        assert result.success is True
        schema_file = os.path.join(output_dir, DEFAULT_RUN_ID, "schemas", model.name, "schema.json")
        assert os.path.exists(schema_file)

    def test_failure_when_schema_build_raises(self, mocker):
        source = SqliteSource(name="source", database=":memory:", type="sqlite")
        model = SqlModel(name="orders", sql="SELECT 1 AS id", source="ref(source)")
        dag = _project(model, source).dag()
        output_dir = temp_folder()
        mocker.patch(
            "visivo.jobs.run_sql_model_job._build_and_write_schema",
            side_effect=RuntimeError("schema build blew up"),
        )

        result = schema_only_action(model, dag, output_dir)
        assert result.success is False
        assert "orders" in result.message


class TestJobTableReference:
    def test_model_referenced_by_table_gets_data_action(self):
        """A model with no dynamic insight but referenced by a table's `data`
        must still produce parquet, so job() picks the data action."""
        source = SqliteSource(name="source", database=":memory:", type="sqlite")
        model = SqlModel(name="orders", sql="SELECT 1 AS id", source="ref(source)")
        table = Table(name="orders_table", data="${ref(orders)}")
        dashboard = Dashboard(name="dash", rows=[Row(items=[Item(width=1, table=table)])])
        dag = _project(model, source, dashboards=[dashboard]).dag()
        output_dir = temp_folder()

        created = job(dag, output_dir, model)
        assert created.action is model_query_and_schema_action

    def test_model_with_no_consumers_gets_schema_only(self):
        source = SqliteSource(name="source", database=":memory:", type="sqlite")
        model = SqlModel(name="orders", sql="SELECT 1 AS id", source="ref(source)")
        dag = _project(model, source).dag()
        output_dir = temp_folder()

        created = job(dag, output_dir, model)
        assert created.action is schema_only_action
