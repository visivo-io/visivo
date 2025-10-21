"""Tests for run_sql_model_job."""

import os
import pytest
from unittest.mock import Mock, patch
import polars as pl
from visivo.models.project import Project
from visivo.models.models.sql_model import SqlModel
from visivo.models.insight import Insight
from visivo.models.props.insight_props import InsightProps
from visivo.models.interaction import InsightInteraction
from visivo.models.inputs.types.dropdown import DropdownInput
from visivo.jobs.run_sql_model_job import job, model_query_and_schema_action, schema_only_action
from visivo.jobs.job import JobResult
from tests.factories.model_factories import SourceFactory, ProjectFactory
from tests.support.utils import temp_folder


class TestRunSqlModelJob:
    """Tests for sql_model_job job creation logic."""

    def test_job_created_for_dynamic_insight(self):
        """Test that a job is created with model_query_and_schema_action when a model is referenced by a dynamic insight."""
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

        # Job should be created with model_query_and_schema_action because insight is dynamic
        assert sql_model_job is not None
        assert sql_model_job.item == orders_model
        assert sql_model_job.action == model_query_and_schema_action

    def test_job_created_with_schema_only_for_static_insight(self):
        """Test that a job is created with schema_only_action when a model is only referenced by static insights."""
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

        # Job should be created with schema_only_action because insight is not dynamic
        assert sql_model_job is not None
        assert sql_model_job.item == orders_model
        assert sql_model_job.action == schema_only_action

    def test_job_uses_correct_action_based_on_dynamic_insight(self):
        """Test that only models referenced by dynamic insights get parquet generation."""
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

        # users_model is NOT referenced by the dynamic insight, so it gets schema_only_action
        users_job = job(dag=dag, output_dir=output_dir, sql_model=users_model)
        assert users_job is not None
        assert users_job.item == users_model
        assert users_job.action == schema_only_action

        # orders_model IS referenced by the dynamic insight, so it gets model_query_and_schema_action
        orders_job = job(dag=dag, output_dir=output_dir, sql_model=orders_model)
        assert orders_job is not None
        assert orders_job.item == orders_model
        assert orders_job.action == model_query_and_schema_action


class TestRunSqlModelJobAction:
    """Tests for sql_model_job action execution."""

    def test_model_query_and_schema_action_success(self):
        """Test that model_query_and_schema_action successfully executes SQL and saves parquet file."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT 1 as id, 'test' as name",
            source=f"ref({source.name})",
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model],
            dashboards=[],
        )

        output_dir = temp_folder()
        dag = project.dag()

        # Mock the source to return test data
        test_data = [{"id": 1, "name": "test"}, {"id": 2, "name": "test2"}]

        with (
            patch("visivo.jobs.run_sql_model_job.get_source_for_model") as mock_get_source,
            patch(
                "visivo.jobs.run_sql_model_job.SchemaAggregator.load_source_schema"
            ) as mock_load_schema,
            patch("visivo.jobs.run_sql_model_job.schema_from_sql") as mock_schema_from_sql,
        ):

            mock_source = Mock()
            mock_source.read_sql.return_value = test_data
            mock_source.get_sqlglot_dialect.return_value = "sqlite"
            mock_get_source.return_value = mock_source

            # Mock schema loading
            mock_load_schema.return_value = {"sqlglot_schema": {}}
            mock_schema_from_sql.return_value = {"columns": ["id", "name"]}

            # Execute action
            result = model_query_and_schema_action(orders_model, dag, output_dir)

            # Check result
            assert isinstance(result, JobResult)
            assert result.success is True
            assert result.item == orders_model
            assert "orders" in result.message

            # Verify read_sql was called with correct SQL
            mock_source.read_sql.assert_called_once_with(orders_model.sql)

            # Check that parquet file was created
            parquet_path = os.path.join(output_dir, "files", f"{orders_model.name_hash()}.parquet")
            assert os.path.exists(parquet_path)

            # Verify parquet file contents
            df = pl.read_parquet(parquet_path)
            assert len(df) == 2
            assert list(df.columns) == ["id", "name"]
            assert df["id"].to_list() == [1, 2]
            assert df["name"].to_list() == ["test", "test2"]

            # Verify schema file was created
            schema_file = os.path.join(output_dir, "schema", orders_model.name, "schema.json")
            assert os.path.exists(schema_file)

    def test_model_query_and_schema_action_failure(self):
        """Test that model_query_and_schema_action handles SQL execution failures gracefully."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT invalid syntax",
            source=f"ref({source.name})",
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model],
            dashboards=[],
        )

        output_dir = temp_folder()
        dag = project.dag()

        with (
            patch("visivo.jobs.run_sql_model_job.get_source_for_model") as mock_get_source,
            patch(
                "visivo.jobs.run_sql_model_job.SchemaAggregator.load_source_schema"
            ) as mock_load_schema,
        ):

            mock_source = Mock()
            mock_source.get_sqlglot_dialect.return_value = "sqlite"
            # Simulate SQL execution failure
            mock_source.read_sql.side_effect = Exception("SQL syntax error")
            mock_get_source.return_value = mock_source
            mock_load_schema.return_value = {"sqlglot_schema": {}}

            # Execute action
            result = model_query_and_schema_action(orders_model, dag, output_dir)

            # Check result
            assert isinstance(result, JobResult)
            assert result.success is False
            assert result.item == orders_model
            assert "Failed query" in result.message
            assert "orders" in result.message

    def test_schema_only_action_success(self):
        """Test that schema_only_action successfully writes schema without executing query."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=f"ref({source.name})",
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model],
            dashboards=[],
        )

        output_dir = temp_folder()
        dag = project.dag()

        with (
            patch("visivo.jobs.run_sql_model_job.get_source_for_model") as mock_get_source,
            patch(
                "visivo.jobs.run_sql_model_job.SchemaAggregator.load_source_schema"
            ) as mock_load_schema,
            patch("visivo.jobs.run_sql_model_job.schema_from_sql") as mock_schema_from_sql,
        ):

            mock_source = Mock()
            mock_source.get_sqlglot_dialect.return_value = "sqlite"
            mock_get_source.return_value = mock_source

            # Mock schema loading
            mock_load_schema.return_value = {"sqlglot_schema": {}}
            mock_schema_from_sql.return_value = {"columns": ["id", "name", "date"]}

            # Execute action
            result = schema_only_action(orders_model, dag, output_dir)

            # Check result
            assert isinstance(result, JobResult)
            assert result.success is True
            assert result.item == orders_model
            assert "orders" in result.message

            # Verify read_sql was NOT called (schema only, no data query)
            mock_source.read_sql.assert_not_called()

            # Verify schema file was created
            schema_file = os.path.join(output_dir, "schema", orders_model.name, "schema.json")
            assert os.path.exists(schema_file)

            # Verify parquet file was NOT created (schema only, no data)
            parquet_path = os.path.join(output_dir, "files", f"{orders_model.name_hash()}.parquet")
            assert not os.path.exists(parquet_path)

    def test_schema_only_action_failure(self):
        """Test that schema_only_action handles schema generation failures gracefully."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT invalid syntax",
            source=f"ref({source.name})",
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model],
            dashboards=[],
        )

        output_dir = temp_folder()
        dag = project.dag()

        with (
            patch("visivo.jobs.run_sql_model_job.get_source_for_model") as mock_get_source,
            patch(
                "visivo.jobs.run_sql_model_job.SchemaAggregator.load_source_schema"
            ) as mock_load_schema,
            patch("visivo.jobs.run_sql_model_job.schema_from_sql") as mock_schema_from_sql,
        ):

            mock_source = Mock()
            mock_source.get_sqlglot_dialect.return_value = "sqlite"
            mock_get_source.return_value = mock_source
            mock_load_schema.return_value = {"sqlglot_schema": {}}
            # Simulate schema generation failure
            mock_schema_from_sql.side_effect = Exception("Invalid SQL syntax")

            # Execute action
            result = schema_only_action(orders_model, dag, output_dir)

            # Check result
            assert isinstance(result, JobResult)
            assert result.success is False
            assert result.item == orders_model
            assert "Failed schema" in result.message
            assert "orders" in result.message
