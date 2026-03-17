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

    def test_validate_object_with_data_ref(self):
        """Test validate_object with data reference."""
        manager = TableManager()
        config = {
            "name": "test_table",
            "data": "ref(my_insight)",
        }

        table = manager.validate_object(config)

        assert table is not None
        assert table.name == "test_table"
        assert table.data == "ref(my_insight)"

    def test_get_table_with_status_returns_child_item_names_for_data_ref(self):
        """Test that get_table_with_status returns data ref in child_item_names."""
        manager = TableManager()
        config = {
            "name": "table_with_data",
            "data": "ref(my_insight)",
        }
        manager.save_from_config(config)

        result = manager.get_table_with_status("table_with_data")

        assert result["name"] == "table_with_data"
        assert "child_item_names" in result
        assert "my_insight" in result["child_item_names"]

    def test_get_table_with_status_returns_child_item_names_for_columns(self):
        """Test that child_item_names includes refs from columns."""
        manager = TableManager()
        config = {
            "name": "table_with_columns",
            "columns": ["${ref(insight_one).x}", "${ref(insight_two).y}"],
        }
        manager.save_from_config(config)

        result = manager.get_table_with_status("table_with_columns")

        assert result["name"] == "table_with_columns"
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

    def test_extract_from_dag_with_data_ref(self):
        """Test that tables loaded from DAG have correct child_item_names for data refs."""
        insight = InsightFactory.build(name="test_insight")

        table = TableFactory.build(
            name="table_with_data_ref",
            data="ref(test_insight)",
            traces=[],
        )

        project = ProjectFactory.build(
            insights=[insight],
            tables=[table],
            dashboards=[],
        )

        dag = project.dag()
        manager = TableManager()
        manager.extract_from_dag(dag)

        result = manager.get_table_with_status("table_with_data_ref")

        assert result is not None
        assert result["name"] == "table_with_data_ref"
        assert "child_item_names" in result
        assert "test_insight" in result["child_item_names"]

    def test_extract_from_dag_with_columns_refs(self):
        """Test that tables loaded from DAG correctly extract refs from columns."""
        insight1 = InsightFactory.build(name="insight_alpha")
        insight2 = InsightFactory.build(name="insight_beta")

        table = TableFactory.build(
            name="columns_table",
            columns=[
                "${ref(insight_alpha).x}",
                "${ref(insight_beta).y}",
            ],
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

        result = manager.get_table_with_status("columns_table")

        assert result is not None
        assert "insight_alpha" in result["child_item_names"]
        assert "insight_beta" in result["child_item_names"]
