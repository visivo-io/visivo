import pytest
from unittest.mock import Mock, patch
from pydantic import ValidationError

from visivo.server.managers.source_manager import SourceManager
from visivo.server.managers.object_manager import ObjectStatus
from tests.factories.model_factories import SourceFactory, ProjectFactory


class TestSourceManager:
    """Test suite for SourceManager class."""

    def test_init_creates_source_adapter(self):
        """Test that initialization creates a TypeAdapter for SourceField."""
        manager = SourceManager()

        assert manager._source_adapter is not None

    def test_validate_object_valid_sqlite_config(self):
        """Test validate_object with valid SQLite configuration."""
        manager = SourceManager()
        config = {"name": "test_sqlite", "type": "sqlite", "database": ":memory:"}

        source = manager.validate_object(config)

        assert source is not None
        assert source.name == "test_sqlite"
        assert source.type == "sqlite"

    def test_validate_object_valid_postgresql_config(self):
        """Test validate_object with valid PostgreSQL configuration."""
        manager = SourceManager()
        config = {
            "name": "test_pg",
            "type": "postgresql",
            "host": "localhost",
            "port": 5432,
            "database": "test_db",
            "username": "test_user",
        }

        source = manager.validate_object(config)

        assert source is not None
        assert source.name == "test_pg"
        assert source.type == "postgresql"

    def test_validate_object_valid_duckdb_config(self):
        """Test validate_object with valid DuckDB configuration."""
        manager = SourceManager()
        config = {"name": "test_duckdb", "type": "duckdb", "database": ":memory:"}

        source = manager.validate_object(config)

        assert source is not None
        assert source.name == "test_duckdb"
        assert source.type == "duckdb"

    def test_validate_object_invalid_type_raises(self):
        """Test validate_object raises error for invalid source type."""
        manager = SourceManager()
        config = {"name": "test", "type": "invalid_type", "database": "test"}

        with pytest.raises(Exception):
            manager.validate_object(config)

    def test_validate_object_missing_required_field_raises(self):
        """Test validate_object raises error for missing required field."""
        manager = SourceManager()
        config = {"name": "test", "type": "sqlite"}  # missing database

        with pytest.raises(Exception):
            manager.validate_object(config)

    def test_extract_from_project_populates_published(self):
        """Test extract_from_project populates published_objects."""
        manager = SourceManager()
        project = ProjectFactory.build()

        manager.extract_from_project(project)

        assert len(manager.published_objects) == len(project.sources)
        for source in project.sources:
            assert source.name in manager.published_objects

    def test_extract_from_project_clears_existing(self):
        """Test extract_from_project clears existing published_objects."""
        manager = SourceManager()
        manager._published_objects["old"] = SourceFactory.build(name="old")
        project = ProjectFactory.build()

        manager.extract_from_project(project)

        assert "old" not in manager.published_objects

    def test_save_from_config_validates_and_saves(self):
        """Test save_from_config validates and saves source."""
        manager = SourceManager()
        config = {"name": "new_source", "type": "sqlite", "database": ":memory:"}

        source = manager.save_from_config(config)

        assert source.name == "new_source"
        assert "new_source" in manager.cached_objects
        assert manager.cached_objects["new_source"] == source

    def test_save_from_config_invalid_raises(self):
        """Test save_from_config raises for invalid config."""
        manager = SourceManager()
        config = {"name": "test", "type": "invalid"}

        with pytest.raises(Exception):
            manager.save_from_config(config)

    def test_test_connection_cached_source(self):
        """Test test_connection works with cached source."""
        manager = SourceManager()
        config = {"name": "test", "type": "sqlite", "database": ":memory:"}
        manager.save_from_config(config)

        with patch("visivo.server.managers.source_manager._test_source_connection") as mock_test:
            mock_test.return_value = {"source": "test", "status": "connected"}
            result = manager.test_connection("test")

        assert result["status"] == "connected"
        mock_test.assert_called_once()

    def test_test_connection_published_source(self):
        """Test test_connection works with published source."""
        manager = SourceManager()
        source = SourceFactory.build(name="published_source")
        manager._published_objects["published_source"] = source

        with patch("visivo.server.managers.source_manager._test_source_connection") as mock_test:
            mock_test.return_value = {"source": "published_source", "status": "connected"}
            result = manager.test_connection("published_source")

        assert result["status"] == "connected"

    def test_test_connection_not_found(self):
        """Test test_connection returns error for nonexistent source."""
        manager = SourceManager()

        result = manager.test_connection("nonexistent")

        assert "not_found" in result["status"] or "error" in result

    def test_get_source_with_status_cached(self):
        """Test get_source_with_status for cached source."""
        manager = SourceManager()
        config = {"name": "cached_src", "type": "sqlite", "database": ":memory:"}
        manager.save_from_config(config)

        result = manager.get_source_with_status("cached_src")

        assert result["name"] == "cached_src"
        assert result["status"] == ObjectStatus.NEW.value
        assert result["config"]["type"] == "sqlite"
        assert "child_item_names" in result

    def test_get_source_with_status_published(self):
        """Test get_source_with_status for published source."""
        manager = SourceManager()
        source = SourceFactory.build(name="published_src")
        manager._published_objects["published_src"] = source

        result = manager.get_source_with_status("published_src")

        assert result["name"] == "published_src"
        assert result["status"] == ObjectStatus.PUBLISHED.value

    def test_get_source_with_status_modified(self):
        """Test get_source_with_status for modified source."""
        manager = SourceManager()
        published_source = SourceFactory.build(name="mod_src")
        manager._published_objects["mod_src"] = published_source

        config = {"name": "mod_src", "type": "sqlite", "database": ":memory:"}
        manager.save_from_config(config)

        result = manager.get_source_with_status("mod_src")

        assert result["name"] == "mod_src"
        assert result["status"] == ObjectStatus.MODIFIED.value

    def test_get_source_with_status_not_found(self):
        """Test get_source_with_status returns None for nonexistent."""
        manager = SourceManager()

        result = manager.get_source_with_status("nonexistent")

        assert result is None

    def test_get_all_sources_with_status(self):
        """Test get_all_sources_with_status returns all sources."""
        manager = SourceManager()

        # Add published source
        published_source = SourceFactory.build(name="published")
        manager._published_objects["published"] = published_source

        # Add cached source
        config = {"name": "cached", "type": "sqlite", "database": ":memory:"}
        manager.save_from_config(config)

        result = manager.get_all_sources_with_status()

        assert len(result) == 2
        names = [r["name"] for r in result]
        assert "published" in names
        assert "cached" in names

    def test_get_all_sources_with_status_includes_deleted_with_status(self):
        """Test get_all_sources_with_status includes deleted items with DELETED status."""
        manager = SourceManager()
        source = SourceFactory.build(name="to_delete")
        manager._published_objects["to_delete"] = source
        manager.mark_for_deletion("to_delete")

        result = manager.get_all_sources_with_status()

        names = [r["name"] for r in result]
        assert "to_delete" in names
        deleted_item = next(r for r in result if r["name"] == "to_delete")
        assert deleted_item["status"] == ObjectStatus.DELETED.value

    def test_get_sources_list(self):
        """Test get_sources_list returns list of Source objects."""
        manager = SourceManager()
        source1 = SourceFactory.build(name="source1")
        manager._published_objects["source1"] = source1

        config = {"name": "source2", "type": "sqlite", "database": ":memory:"}
        manager.save_from_config(config)

        result = manager.get_sources_list()

        assert len(result) == 2
        assert all(hasattr(s, "name") for s in result)

    def test_get_sources_list_excludes_none_values(self):
        """Test get_sources_list excludes None values (marked for deletion)."""
        manager = SourceManager()
        source = SourceFactory.build(name="to_delete")
        manager._published_objects["to_delete"] = source
        manager.mark_for_deletion("to_delete")

        result = manager.get_sources_list()

        names = [s.name for s in result]
        assert "to_delete" not in names

    def test_validate_config_valid(self):
        """Test validate_config with valid configuration."""
        manager = SourceManager()
        config = {"name": "test", "type": "sqlite", "database": ":memory:"}

        result = manager.validate_config(config)

        assert result["valid"] is True
        assert result["name"] == "test"
        assert result["type"] == "sqlite"

    def test_validate_config_invalid(self):
        """Test validate_config with invalid configuration."""
        manager = SourceManager()
        config = {"name": "test", "type": "invalid"}

        result = manager.validate_config(config)

        assert result["valid"] is False
        assert "error" in result

    def test_cached_source_prioritized_over_published(self):
        """Test that cached source is returned instead of published."""
        manager = SourceManager()

        # Add published source
        published_source = SourceFactory.build(name="test", database="published.db")
        manager._published_objects["test"] = published_source

        # Add cached source with same name
        config = {"name": "test", "type": "sqlite", "database": "cached.db"}
        manager.save_from_config(config)

        # Get should return cached
        result = manager.get("test")
        assert result.database == "cached.db"

    def test_load_preserves_cached_objects(self):
        """Test that load() preserves existing cached objects."""
        manager = SourceManager()

        # Add cached source
        config = {"name": "cached_only", "type": "sqlite", "database": ":memory:"}
        manager.save_from_config(config)

        # Load project
        project = ProjectFactory.build()
        manager.load(project)

        # Cached object should still exist
        assert "cached_only" in manager.cached_objects

    def test_hot_reload_scenario(self):
        """Test hot reload scenario: project updates while cached changes exist."""
        manager = SourceManager()

        # Initial load
        project1 = ProjectFactory.build()
        manager.load(project1)
        initial_published_count = len(manager.published_objects)

        # User makes cached change
        config = {"name": "user_change", "type": "sqlite", "database": ":memory:"}
        manager.save_from_config(config)

        # Hot reload with updated project
        project2 = ProjectFactory.build()
        manager.load(project2)

        # Cached change should persist
        assert "user_change" in manager.cached_objects
        # Published objects should reflect new project
        assert len(manager.published_objects) == len(project2.sources)
