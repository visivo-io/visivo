import pytest
from visivo.server.managers.chart_manager import ChartManager
from visivo.server.managers.object_manager import ObjectStatus
from tests.factories.model_factories import (
    ChartFactory,
    InsightFactory,
    ProjectFactory,
    DashboardFactory,
)


class TestChartManager:
    """Test suite for ChartManager class."""

    def test_init_creates_chart_adapter(self):
        """Test that initialization creates a TypeAdapter for Chart."""
        manager = ChartManager()
        assert manager._chart_adapter is not None

    def test_validate_object_valid_config(self):
        """Test validate_object with valid chart configuration."""
        manager = ChartManager()
        config = {"name": "test_chart"}

        chart = manager.validate_object(config)

        assert chart is not None
        assert chart.name == "test_chart"

    def test_validate_object_with_insights_refs(self):
        """Test validate_object with insight references."""
        manager = ChartManager()
        config = {
            "name": "test_chart",
            "insights": ["ref(my_insight)"],
        }

        chart = manager.validate_object(config)

        assert chart is not None
        assert chart.name == "test_chart"
        assert len(chart.insights) == 1
        assert chart.insights[0] == "ref(my_insight)"

    def test_get_chart_with_status_returns_child_item_names_for_insight_ref(self):
        """Test that get_chart_with_status returns insight in child_item_names."""
        manager = ChartManager()
        config = {
            "name": "chart_with_insight",
            "insights": ["ref(my_insight)"],
        }
        manager.save_from_config(config)

        result = manager.get_chart_with_status("chart_with_insight")

        assert result["name"] == "chart_with_insight"
        assert "child_item_names" in result
        assert "my_insight" in result["child_item_names"]

    def test_get_chart_with_status_returns_child_item_names_for_multiple_insights(self):
        """Test that child_item_names includes all insights."""
        manager = ChartManager()
        config = {
            "name": "chart_multiple_insights",
            "insights": ["ref(insight_one)", "ref(insight_two)"],
        }
        manager.save_from_config(config)

        result = manager.get_chart_with_status("chart_multiple_insights")

        assert result["name"] == "chart_multiple_insights"
        assert "child_item_names" in result
        assert "insight_one" in result["child_item_names"]
        assert "insight_two" in result["child_item_names"]

    def test_save_from_config_validates_and_saves(self):
        """Test save_from_config validates and saves chart."""
        manager = ChartManager()
        config = {"name": "new_chart"}

        chart = manager.save_from_config(config)

        assert chart.name == "new_chart"
        assert "new_chart" in manager.cached_objects
        assert manager.cached_objects["new_chart"] == chart

    def test_get_chart_with_status_cached(self):
        """Test get_chart_with_status for cached chart."""
        manager = ChartManager()
        config = {"name": "cached_chart"}
        manager.save_from_config(config)

        result = manager.get_chart_with_status("cached_chart")

        assert result["name"] == "cached_chart"
        assert result["status"] == ObjectStatus.NEW.value
        assert "child_item_names" in result

    def test_get_chart_with_status_not_found(self):
        """Test get_chart_with_status returns None for nonexistent."""
        manager = ChartManager()

        result = manager.get_chart_with_status("nonexistent")

        assert result is None

    def test_validate_config_valid(self):
        """Test validate_config with valid configuration."""
        manager = ChartManager()
        config = {"name": "test"}

        result = manager.validate_config(config)

        assert result["valid"] is True
        assert result["name"] == "test"

    def test_validate_config_invalid(self):
        """Test validate_config with invalid configuration (extra fields)."""
        manager = ChartManager()
        config = {"name": "test", "unknown_field": "value"}

        result = manager.validate_config(config)

        assert result["valid"] is False
        assert "error" in result

    def test_extract_from_dag_with_insight_refs(self):
        """Test that charts loaded from DAG have correct child_item_names for insight refs."""
        # Create an insight that the chart will reference
        insight = InsightFactory.build(name="test_insight")

        # Create a chart that references the insight
        chart = ChartFactory.build(
            name="chart_with_insight_ref",
            insights=["ref(test_insight)"],
            traces=[],
        )

        # Create a project with both the insight and the chart
        project = ProjectFactory.build(
            insights=[insight],
            charts=[chart],
            dashboards=[],
        )

        # Build the DAG and extract charts
        dag = project.dag()
        manager = ChartManager()
        manager.extract_from_dag(dag)

        # Get the chart with status and verify child_item_names
        result = manager.get_chart_with_status("chart_with_insight_ref")

        assert result is not None
        assert result["name"] == "chart_with_insight_ref"
        assert "child_item_names" in result
        assert "test_insight" in result["child_item_names"]

    def test_extract_from_dag_with_multiple_insight_refs(self):
        """Test that charts loaded from DAG correctly extract multiple insight refs."""
        insight1 = InsightFactory.build(name="insight_alpha")
        insight2 = InsightFactory.build(name="insight_beta")

        chart = ChartFactory.build(
            name="multi_insight_chart",
            insights=["ref(insight_alpha)", "ref(insight_beta)"],
            traces=[],
        )

        project = ProjectFactory.build(
            insights=[insight1, insight2],
            charts=[chart],
            dashboards=[],
        )

        dag = project.dag()
        manager = ChartManager()
        manager.extract_from_dag(dag)

        result = manager.get_chart_with_status("multi_insight_chart")

        assert result is not None
        assert "insight_alpha" in result["child_item_names"]
        assert "insight_beta" in result["child_item_names"]
