"""
Tests for telemetry collector utilities.
"""

import os
from unittest import mock

from visivo.telemetry.collector import collect_project_metrics, count_filtered_jobs
from visivo.models.project import Project


class TestTelemetryCollector:
    """Test telemetry collection utilities."""

    def setup_method(self):
        """Disable telemetry for all tests."""
        os.environ["VISIVO_TELEMETRY_DISABLED"] = "true"

    def test_collect_project_metrics_empty(self):
        """Test collecting metrics from empty project."""
        project = Project(name="test")
        metrics = collect_project_metrics(project)

        assert metrics == {
            "sources": 0,
            "models": 0,
            "traces": 0,
            "tables": 0,
            "charts": 0,
            "insights": 0,
            "dashboards": 0,
            "alerts": 0,
            "destinations": 0,
            "inputs": 0,
        }

    def test_collect_project_metrics_with_objects(self):
        """Test collecting metrics from project with various objects."""
        project = Project(name="test")

        project.sources = [mock.MagicMock(), mock.MagicMock()]
        project.models = [mock.MagicMock(), mock.MagicMock(), mock.MagicMock()]
        project.tables = []
        project.charts = [mock.MagicMock(), mock.MagicMock()]
        project.dashboards = [mock.MagicMock()]
        project.alerts = [mock.MagicMock()]
        project.destinations = [mock.MagicMock()]
        project.insights = [mock.MagicMock()]
        project.inputs = [mock.MagicMock(), mock.MagicMock()]

        metrics = collect_project_metrics(project)

        assert metrics == {
            "sources": 2,
            "models": 3,
            "traces": 0,
            "tables": 0,
            "charts": 2,
            "dashboards": 1,
            "alerts": 1,
            "destinations": 1,
            "insights": 1,
            "inputs": 2,
        }

    def test_collect_project_metrics_none_lists(self):
        """Test collecting metrics when some lists are None."""
        project = Project(name="test")
        project.sources = None
        project.models = None

        metrics = collect_project_metrics(project)

        assert metrics["sources"] == 0
        assert metrics["models"] == 0

    def test_count_filtered_jobs_simple(self):
        """Test counting jobs with mock DAG."""
        mock_dag = mock.MagicMock()
        mock_dag.filter_dag.return_value = [
            mock.MagicMock(),
            mock.MagicMock(),
            mock.MagicMock(),
        ]

        count = count_filtered_jobs(mock_dag, "+chart1+")
        assert count == 3

        mock_dag.filter_dag.assert_called_once_with("+chart1+")

    def test_count_filtered_jobs_empty(self):
        """Test counting jobs when filter returns no jobs."""
        mock_dag = mock.MagicMock()
        mock_dag.filter_dag.return_value = []

        count = count_filtered_jobs(mock_dag, "+nonexistent+")
        assert count == 0

    def test_count_filtered_jobs_error(self):
        """Test counting jobs when an error occurs."""
        mock_dag = mock.MagicMock()
        mock_dag.filter_dag.side_effect = Exception("DAG error")

        count = count_filtered_jobs(mock_dag, "+chart1+")
        assert count == -1

    def test_count_filtered_jobs_large_count(self):
        """Test counting many jobs efficiently."""

        def job_generator():
            for i in range(1000):
                yield mock.MagicMock()

        mock_dag = mock.MagicMock()
        mock_dag.filter_dag.return_value = job_generator()

        count = count_filtered_jobs(mock_dag, "+all+")
        assert count == 1000
