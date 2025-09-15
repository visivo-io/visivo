import tempfile
import os
import json
from unittest.mock import Mock, patch

from visivo.jobs.run_insight_job import action, _get_tokenized_insight, _get_source, job
from visivo.models.insight import Insight
from visivo.models.tokenized_insight import TokenizedInsight
from visivo.jobs.job import JobResult
from tests.factories.model_factories import (
    SnowflakeSourceFactory,
    SqlModelFactory,
    InsightFactory,  # We'll need to create this
)
import pytest


def test_insight_job_action_success():
    """Test that insight job action executes successfully"""
    # Create test insight
    insight_data = {
        "name": "test_insight",
        "model": {"sql": "SELECT 1 as x, 2 as y"},
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

    # Mock DAG
    dag = Mock()

    with tempfile.TemporaryDirectory() as temp_dir:
        # Mock all_descendants_of_type function
        with patch("visivo.jobs.run_insight_job.all_descendants_of_type") as mock_descendants:
            # First call returns model, second call returns source
            # mock_descendants.side_effect = [[model], [model], [source]]
            def mock_all_descendants(type, dag, from_node):
                if type.__name__ == "Model":
                    return [model]
                if type.__name__ == "Source":
                    return [source]
                return []

            mock_descendants.side_effect = mock_all_descendants

            # Execute action
            result = action(insight, dag, temp_dir)

            # Check result
            assert isinstance(result, JobResult)
            assert result.success == True
            assert result.item == insight
            assert "test_insight" in result.message

            # Verify read_sql was called
            source.read_sql.assert_called_once()

            # Check that insight.json was created
            insight_file = os.path.join(temp_dir, "insights", "test_insight", "insight.json")
            assert os.path.exists(insight_file)

            # Check file contents
            with open(insight_file, "r") as f:
                insight_json = json.load(f)

            assert "data" in insight_json
            assert "pre_query" in insight_json
            assert "post_query" in insight_json
            assert "metadata" in insight_json


def test_insight_job_action_failure():
    """Test that insight job handles failures gracefully"""
    insight_data = {
        "name": "failing_insight",
        "model": {"sql": "SELECT invalid syntax"},
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

    dag = Mock()

    with tempfile.TemporaryDirectory() as temp_dir:
        with patch("visivo.jobs.run_insight_job.all_descendants_of_type") as mock_descendants:
            # mock_descendants.side_effect = [[model], [source]]
            def mock_all_descendants(type, dag, from_node):
                if type.__name__ == "Model":
                    return [model]
                if type.__name__ == "Source":
                    return [source]
                return []

            mock_descendants.side_effect = mock_all_descendants

            result = action(insight, dag, temp_dir)

            # Check result
            assert isinstance(result, JobResult)
            assert result.success == False
            assert result.item == insight
            assert "Failed query" in result.message
            assert "failing_insight" in result.message


def test_get_tokenized_insight():
    """Test that tokenized insight is generated correctly"""
    insight_data = {
        "name": "tokenize_test",
        "model": {"sql": "SELECT * FROM test"},
        "props": {"type": "scatter", "x": "?{date}", "y": "?{amount}"},
    }
    insight = Insight(**insight_data)

    model = SqlModelFactory(sql="SELECT * FROM test")
    source = Mock()
    source.name = "test_source"
    source.type = "snowflake"
    source.get_dialect.return_value = "snowflake"

    dag = Mock()

    with tempfile.TemporaryDirectory() as temp_dir:
        with patch("visivo.jobs.run_insight_job.all_descendants_of_type") as mock_descendants:
            mock_descendants.side_effect = [[model], [source]]

            tokenized = _get_tokenized_insight(insight, dag, temp_dir)

            assert isinstance(tokenized, TokenizedInsight)
            assert tokenized.name == "tokenize_test"
            assert tokenized.source == source.name
            assert "props.x" in tokenized.select_items
            assert "props.y" in tokenized.select_items


def test_get_source():
    """Test that source is retrieved correctly"""
    insight = Insight(name="source_test", model={"sql": "SELECT 1"}, props={"type": "scatter"})

    model = SqlModelFactory()
    source = Mock()
    source.name = "test_source"
    source.type = "snowflake"

    dag = Mock()

    with tempfile.TemporaryDirectory() as temp_dir:
        with patch("visivo.jobs.run_insight_job.all_descendants_of_type") as mock_descendants:
            # First call returns single source, second call returns model
            mock_descendants.side_effect = [[source], [model]]

            result_source = _get_source(insight, dag, temp_dir)

            assert result_source == source


def test_job_creation():
    """Test that insight job is created correctly"""
    insight = Insight(name="job_test", model={"sql": "SELECT 1"}, props={"type": "scatter"})

    model = SqlModelFactory()
    source = Mock()
    source.name = "test_source"
    source.type = "snowflake"

    dag = Mock()

    with tempfile.TemporaryDirectory() as temp_dir:
        with patch("visivo.jobs.run_insight_job.all_descendants_of_type") as mock_descendants:
            mock_descendants.side_effect = [[source], [model]]

            insight_job = job(dag, temp_dir, insight)

            assert insight_job.item == insight
            assert insight_job.source == source
            assert callable(insight_job.action)
            assert insight_job.kwargs["insight"] == insight
            assert insight_job.kwargs["dag"] == dag
            assert insight_job.kwargs["output_dir"] == temp_dir
