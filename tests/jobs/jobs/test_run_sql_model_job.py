"""Tests for run_sql_model_job."""

import pytest
from visivo.models.project import Project
from visivo.models.models.sql_model import SqlModel
from visivo.models.insight import Insight
from visivo.models.props.insight_props import InsightProps
from visivo.models.interaction import InsightInteraction
from visivo.models.inputs.dropdown import DropdownInput
from visivo.jobs.run_sql_model_job import job, action
from tests.factories.model_factories import SourceFactory, ProjectFactory
from tests.support.utils import temp_folder


class TestRunSqlModelJob:
    """Tests for sql_model_job job creation logic."""

    def test_job_created_for_dynamic_insight(self):
        """Test that a job is created when a model is referenced by a dynamic insight."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
        )

        # Input for the interaction
        year_input = DropdownInput(
            name="selected_year", label="Select Year", options=["2023", "2024"]
        )

        # Dynamic insight with input in interaction
        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).date}}",
                y="?{${ref(orders).amount}}",
            ),
            interactions=[
                InsightInteraction(filter="?{${ref(orders).date} = ${ref(selected_year)}}"),
            ],
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model],
            inputs=[year_input],
            insights=[insight],
            dashboards=[],
        )

        output_dir = temp_folder()
        dag = project.dag()

        sql_model_job = job(dag=dag, output_dir=output_dir, sql_model=orders_model)

        # Job should be created because insight is dynamic
        assert sql_model_job is not None
        assert sql_model_job.item == orders_model

    def test_job_not_created_for_static_insight(self):
        """Test that no job is created when a model is only referenced by static insights."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
        )

        # Static insight without any inputs
        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).date}}",
                y="?{${ref(orders).amount}}",
            ),
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model],
            insights=[insight],
            dashboards=[],
        )

        output_dir = temp_folder()
        dag = project.dag()

        sql_model_job = job(dag=dag, output_dir=output_dir, sql_model=orders_model)

        # No job should be created because insight is not dynamic
        assert sql_model_job is None

    def test_job_not_created_for_unreferenced_model(self):
        """Test that no job is created for a model not referenced by any dynamic insight."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
        )
        users_model = SqlModel(
            name="users",
            sql="SELECT * FROM users_table",
            source=f"ref({source.name})",
        )

        # Input for the interaction
        year_input = DropdownInput(
            name="selected_year", label="Select Year", options=["2023", "2024"]
        )

        # Dynamic insight that only references orders_model, not users_model
        insight = Insight(
            name="test_insight",
            props=InsightProps(
                type="scatter",
                x="?{${ref(orders).date}}",
                y="?{${ref(orders).amount}}",
            ),
            interactions=[
                InsightInteraction(filter="?{${ref(orders).date} = ${ref(selected_year)}}"),
            ],
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model, users_model],
            inputs=[year_input],
            insights=[insight],
            dashboards=[],
        )

        output_dir = temp_folder()
        dag = project.dag()

        # Job should not be created for users_model
        sql_model_job = job(dag=dag, output_dir=output_dir, sql_model=users_model)
        assert sql_model_job is None

        # But should be created for orders_model
        sql_model_job = job(dag=dag, output_dir=output_dir, sql_model=orders_model)
        assert sql_model_job is not None
