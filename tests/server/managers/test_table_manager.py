import pytest
from visivo.server.managers.table_manager import TableManager
from visivo.server.managers.object_manager import ObjectStatus
from tests.factories.model_factories import (
    TableFactory,
    InsightFactory,
    ProjectFactory,
)


class TestTableManager:
    """Test suite for TableManager class."""

    def test_init_creates_table_adapter(self):
        """Test that initialization creates a TypeAdapter for Table."""
        manager = TableManager()
        assert manager._table_adapter is not None

    def test_validate_object_valid_config(self):
        """Test validate_object with valid table configuration."""
        manager = TableManager()
        config = {"name": "test_table"}

        table = manager.validate_object(config)

        assert table is not None
        assert table.name == "test_table"

    def test_validate_object_with_insights_refs(self):
        """Test validate_object with insight references."""
        manager = TableManager()
        config = {
            "name": "test_table",
            "insights": ["ref(my_insight)"],
        }

        table = manager.validate_object(config)

        assert table is not None
        assert table.name == "test_table"
        assert len(table.insights) == 1
        assert table.insights[0] == "ref(my_insight)"

    def test_get_table_with_status_returns_child_item_names_for_insight_ref(self):
        """Test that get_table_with_status returns insight in child_item_names."""
        manager = TableManager()
        config = {
            "name": "table_with_insight",
            "insights": ["ref(my_insight)"],
        }
        manager.save_from_config(config)

        result = manager.get_table_with_status("table_with_insight")

        assert result["name"] == "table_with_insight"
        assert "child_item_names" in result
        assert "my_insight" in result["child_item_names"]

    def test_get_table_with_status_returns_child_item_names_for_multiple_insights(self):
        """Test that child_item_names includes all insights."""
        manager = TableManager()
        config = {
            "name": "table_multiple_insights",
            "insights": ["ref(insight_one)", "ref(insight_two)"],
        }
        manager.save_from_config(config)

        result = manager.get_table_with_status("table_multiple_insights")

        assert result["name"] == "table_multiple_insights"
        assert "child_item_names" in result
        assert "insight_one" in result["child_item_names"]
        assert "insight_two" in result["child_item_names"]

    def test_save_from_config_validates_and_saves(self):
        """Test save_from_config validates and saves table."""
        manager = TableManager()
        config = {"name": "new_table"}

        table = manager.save_from_config(config)

        assert table.name == "new_table"
        assert "new_table" in manager.cached_objects
        assert manager.cached_objects["new_table"] == table

    def test_get_table_with_status_cached(self):
        """Test get_table_with_status for cached table."""
        manager = TableManager()
        config = {"name": "cached_table"}
        manager.save_from_config(config)

        result = manager.get_table_with_status("cached_table")

        assert result["name"] == "cached_table"
        assert result["status"] == ObjectStatus.NEW.value
        assert "child_item_names" in result

    def test_get_table_with_status_not_found(self):
        """Test get_table_with_status returns None for nonexistent."""
        manager = TableManager()

        result = manager.get_table_with_status("nonexistent")

        assert result is None

    def test_validate_config_valid(self):
        """Test validate_config with valid configuration."""
        manager = TableManager()
        config = {"name": "test"}

        result = manager.validate_config(config)

        assert result["valid"] is True
        assert result["name"] == "test"

    def test_validate_config_invalid(self):
        """Test validate_config with invalid configuration (extra fields)."""
        manager = TableManager()
        config = {"name": "test", "unknown_field": "value"}

        result = manager.validate_config(config)

        assert result["valid"] is False
        assert "error" in result

    def test_extract_from_dag_with_insight_refs(self):
        """Test that tables loaded from DAG have correct child_item_names for insight refs."""
        # Create an insight that the table will reference
        insight = InsightFactory.build(name="test_insight")

        # Create a table that references the insight
        table = TableFactory.build(
            name="table_with_insight_ref",
            insights=["ref(test_insight)"],
            traces=[],
        )

        # Create a project with both the insight and the table
        project = ProjectFactory.build(
            insights=[insight],
            tables=[table],
            dashboards=[],
        )

        # Build the DAG and extract tables
        dag = project.dag()
        manager = TableManager()
        manager.extract_from_dag(dag)

        # Get the table with status and verify child_item_names
        result = manager.get_table_with_status("table_with_insight_ref")

        assert result is not None
        assert result["name"] == "table_with_insight_ref"
        assert "child_item_names" in result
        assert "test_insight" in result["child_item_names"]

    def test_extract_from_dag_with_multiple_insight_refs(self):
        """Test that tables loaded from DAG correctly extract multiple insight refs."""
        insight1 = InsightFactory.build(name="insight_alpha")
        insight2 = InsightFactory.build(name="insight_beta")

        table = TableFactory.build(
            name="multi_insight_table",
            insights=["ref(insight_alpha)", "ref(insight_beta)"],
            traces=[],
        )

        project = ProjectFactory.build(
            insights=[insight1, insight2],
            tables=[table],
            dashboards=[],
        )

        dag = project.dag()
        manager = TableManager()
        manager.extract_from_dag(dag)

        result = manager.get_table_with_status("multi_insight_table")

        assert result is not None
        assert "insight_alpha" in result["child_item_names"]
        assert "insight_beta" in result["child_item_names"]
