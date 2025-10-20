import tempfile
import os
import json
from unittest.mock import Mock, patch

from visivo.jobs.run_insight_job import action, _get_source, job
from visivo.models.insight import Insight
from visivo.models.tokenized_insight import TokenizedInsight
from visivo.jobs.job import JobResult
from visivo.models.base.project_dag import ProjectDag
from tests.factories.model_factories import (
    SnowflakeSourceFactory,
    SqlModelFactory,
    ProjectFactory,
    InsightFactory,  # We'll need to create this
)
import pytest


@pytest.fixture
def mock_dag_with_project():
    """Create a mock DAG that returns a project"""
    project = ProjectFactory()
    dag = Mock(spec=ProjectDag)
    dag.get_project.return_value = project
    dag.__len__ = Mock(return_value=0)  # Mock the __len__ method for all_descendants_of_type
    dag.nodes = Mock(return_value=[])  # Mock the nodes() method to return empty list
    return dag


def test_insight_job_action_success(mock_dag_with_project):
    """Test that insight job action executes successfully"""
    # Create test insight
    insight_data = {
        "name": "test_insight",
        "props": {"type": "scatter", "x": "?{x}", "y": "?{y}"},
    }
    insight = Insight(**insight_data)

    # Mock model and create a mock source
    model = SqlModelFactory(sql="SELECT 1 as x, 2 as y")
    source = Mock()
    source.name = "test_source"
    source.type = "snowflake"
    source.get_dialect.return_value = "snowflake"

    # Test data to return from read_sql
    test_data = [{"x": 1, "y": 2}, {"x": 3, "y": 4}]
    source.read_sql.return_value = test_data

    # Use the mock DAG with project
    dag = mock_dag_with_project

    with tempfile.TemporaryDirectory() as temp_dir:
        # Mock all_descendants_of_type function and get_source_for_model
        with patch("visivo.jobs.run_insight_job.all_descendants_of_type") as mock_descendants:
            with patch("visivo.jobs.run_insight_job.get_source_for_model") as mock_get_source:
                # First call returns model
                mock_descendants.return_value = [model]
                # get_source_for_model returns source
                mock_get_source.return_value = source

                # Execute action
                result = action(insight, dag, temp_dir)

                # Check result
                assert isinstance(result, JobResult)
                assert result.success == True
                assert result.item == insight
                assert "test_insight" in result.message

                # Verify read_sql was called
                source.read_sql.assert_called_once()

                # Check that insight.json was created with name_hash
                insight_hash = insight.name_hash()
                insight_file = os.path.join(temp_dir, "insights", f"{insight_hash}.json")
                assert os.path.exists(insight_file)

                with open(insight_file, "r") as f:
                    insight_json = json.load(f)

                assert "files" in insight_json
                assert "query" in insight_json
                assert "props_mapping" in insight_json

                parquet_file = os.path.join(temp_dir, "files", f"{insight_hash}.parquet")
                assert os.path.exists(parquet_file)


def test_insight_job_action_failure(mock_dag_with_project):
    """Test that insight job handles failures gracefully"""
    insight_data = {
        "name": "failing_insight",
        "props": {"type": "scatter"},
    }
    insight = Insight(**insight_data)

    # Mock model and create a mock source
    model = SqlModelFactory(sql="SELECT invalid syntax")
    source = Mock()
    source.name = "test_source"
    source.type = "snowflake"
    source.get_dialect.return_value = "snowflake"
    source.read_sql.side_effect = Exception("SQL Error")

    dag = mock_dag_with_project

    with tempfile.TemporaryDirectory() as temp_dir:
        with patch("visivo.jobs.run_insight_job.all_descendants_of_type") as mock_descendants:
            with patch("visivo.jobs.run_insight_job.get_source_for_model") as mock_get_source:
                mock_descendants.return_value = [model]
                mock_get_source.return_value = source

                result = action(insight, dag, temp_dir)

                # Check result
                assert isinstance(result, JobResult)
                assert result.success == False
                assert result.item == insight
                assert "Failed job" in result.message
                assert "failing_insight" in result.message


def test_get_source(mock_dag_with_project):
    """Test that source is retrieved correctly"""
    insight = Insight(name="source_test", props={"type": "scatter"})

    model = SqlModelFactory()
    source = Mock()
    source.name = "test_source"
    source.type = "snowflake"

    dag = mock_dag_with_project

    with tempfile.TemporaryDirectory() as temp_dir:
        with patch("visivo.jobs.run_insight_job.all_descendants_of_type") as mock_descendants:
            with patch("visivo.jobs.run_insight_job.get_source_for_model") as mock_get_source:
                mock_descendants.return_value = [model]
                mock_get_source.return_value = source

                result_source = _get_source(insight, dag, temp_dir)

                assert result_source == source


def test_job_creation(mock_dag_with_project):
    """Test that insight job is created correctly"""
    insight = Insight(name="job_test", props={"type": "scatter"})

    model = SqlModelFactory()
    source = Mock()
    source.name = "test_source"
    source.type = "snowflake"

    dag = mock_dag_with_project

    with tempfile.TemporaryDirectory() as temp_dir:
        with patch("visivo.jobs.run_insight_job.all_descendants_of_type") as mock_descendants:
            with patch("visivo.jobs.run_insight_job.get_source_for_model") as mock_get_source:
                mock_descendants.return_value = [model]
                mock_get_source.return_value = source

                insight_job = job(dag, temp_dir, insight)

                assert insight_job.item == insight
                assert insight_job.source == source
                assert callable(insight_job.action)
                assert insight_job.kwargs["insight"] == insight
                assert insight_job.kwargs["dag"] == dag
                assert insight_job.kwargs["output_dir"] == temp_dir
