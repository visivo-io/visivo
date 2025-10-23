import tempfile
import os
import json
from unittest.mock import Mock, patch
import polars as pl

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
