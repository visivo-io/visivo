"""Tests for run_sql_model_job to verify Input logic removal."""

import pytest
from visivo.models.models.sql_model import SqlModel
from visivo.models.inputs.types.single_select import SingleSelectInput
from visivo.models.base.query_string import QueryString
from visivo.models.project import Project
from visivo.models.insight import Insight
from visivo.models.props.insight_props import InsightProps
from visivo.models.interaction import InsightInteraction
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
