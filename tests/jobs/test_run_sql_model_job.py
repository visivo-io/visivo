"""Tests for run_sql_model_job to verify Input logic removal."""

import json
import os

import pytest
from visivo.models.models.sql_model import SqlModel
from visivo.models.inputs.types.single_select import SingleSelectInput
from visivo.models.base.query_string import QueryString
from visivo.models.project import Project
from visivo.models.insight import Insight
from visivo.models.props.insight_props import InsightProps
from visivo.models.interaction import InsightInteraction
from visivo.models.sources.sqlite_source import SqliteSource
from tests.factories.model_factories import SourceFactory
from tests.support.utils import temp_folder


class TestSqlModelJobNoInputLogic:
    """Verify input detection logic removed from run_sql_model_job."""

    def test_no_longer_checks_inputs_for_query_based_options(self):
        """
        Verify that run_sql_model_job no longer creates data jobs just because
        an Input with query-based options references the model.

        Previously: SqlModel would get model_query_and_schema_action if any Input
                    referenced it in query-based options.
        Now: Inputs have their own job system, so SqlModel should only get
             model_query_and_schema_action if referenced by a DYNAMIC insight.
        """
        # ARRANGE
        source = SourceFactory()
        model = SqlModel(name="data", sql="SELECT 1 as x", source=f"ref({source.name})")
        # Create an input with query-based options that references the model
        input_obj = SingleSelectInput(
            name="filter", options="?{ SELECT DISTINCT x FROM ${ref(data)} }"
        )
        # Create insight that does NOT reference the input (so insight is NOT dynamic)
        insight = Insight(
            name="test_insight",
            props=InsightProps(type="scatter", x="?{ ${ref(data).x} }", y="?{ ${ref(data).y} }"),
            interactions=None,  # No interactions, so not dynamic
        )
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            inputs=[input_obj],
            insights=[insight],
            dashboards=[],
        )
        dag = project.dag()
        output_dir = temp_folder()

        # ACT
        from visivo.jobs.run_sql_model_job import (
            job,
            schema_only_action,
            model_query_and_schema_action,
        )

        sql_job = job(dag, output_dir, model)

        # ASSERT
        # Should get schema_only_action because:
        # 1. The insight is NOT dynamic (no inputs referenced in interactions)
        # 2. We removed the logic that checks if inputs reference this model
        assert (
            sql_job.action == schema_only_action
        ), f"Expected schema_only_action, got {sql_job.action.__name__}"

    def test_creates_data_job_for_dynamic_insight(self):
        """
        Verify that run_sql_model_job still creates data jobs for models
        referenced by dynamic insights.
        """
        # ARRANGE
        source = SourceFactory()
        model = SqlModel(name="data", sql="SELECT 1 as x", source=f"ref({source.name})")
        input_obj = SingleSelectInput(name="threshold", options=["10", "20", "30"])
        # Create insight that DOES reference the input (making it dynamic)
        insight = Insight(
            name="test_insight",
            props=InsightProps(type="scatter", x="?{ ${ref(data).x} }", y="?{ ${ref(data).y} }"),
            interactions=[InsightInteraction(filter="?{ x > ${ref(threshold)} }")],
        )
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            inputs=[input_obj],
            insights=[insight],
            dashboards=[],
        )
        dag = project.dag()
        output_dir = temp_folder()

        # ACT
        from visivo.jobs.run_sql_model_job import job, model_query_and_schema_action

        sql_job = job(dag, output_dir, model)

        # ASSERT
        # Should get model_query_and_schema_action because the insight IS dynamic
        assert (
            sql_job.action == model_query_and_schema_action
        ), f"Expected model_query_and_schema_action, got {sql_job.action.__name__}"


class TestSqlModelSchemaArtifact:
    """Verify _build_and_write_schema emits the envelope and preserves the
    legacy {name_hash: {col: type}} block the field resolver depends on."""

    def test_writes_envelope_and_preserves_legacy_hash_block(self):
        from visivo.jobs.run_sql_model_job import _build_and_write_schema

        source = SqliteSource(name="source", database=":memory:", type="sqlite")
        model = SqlModel(
            name="orders_enriched",
            sql="SELECT 1 AS id, 'x' AS name",
            source=f"ref({source.name})",
        )
        output_dir = temp_folder()

        result = _build_and_write_schema(model, source, output_dir)

        # The return value (used by callers) is still the {hash: {col: type}} dict.
        model_hash = model.name_hash()
        assert model_hash in result
        assert set(result[model_hash].keys()) == {"id", "name"}

        schema_file = os.path.join(output_dir, "main", "schemas", model.name, "schema.json")
        assert os.path.exists(schema_file)
        with open(schema_file) as fp:
            data = json.load(fp)

        # Envelope fields present.
        assert data["model_name"] == "orders_enriched"
        assert data["model_type"] == "sql"
        assert "generated_at" in data
        assert data["metadata"]["source_dialect"] == source.get_sqlglot_dialect()

        # Columns block mirrors the SQLGlot-inferred column map.
        assert set(data["columns"].keys()) == {"id", "name"}
        for col in data["columns"].values():
            assert "type" in col
            assert "nullable" in col

        # Legacy {name_hash: {col: type_string}} block preserved AND first key.
        assert next(iter(data.keys())) == model_hash
        legacy = data[model_hash]
        assert set(legacy.keys()) == {"id", "name"}
        assert all(isinstance(v, str) for v in legacy.values())
