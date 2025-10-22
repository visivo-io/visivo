"""Tests for source_metadata module with DuckDB sources."""

import pytest
from visivo.server.source_metadata import get_source_databases, _find_source
from visivo.models.sources.duckdb_source import DuckdbSource


@pytest.fixture
def duckdb_source(tmp_path):
    """Create a DuckDB source for testing."""
    db_path = tmp_path / "test.db"
    source = DuckdbSource(name="test_duckdb", type="duckdb", database=str(db_path))
    # Create the database file
    DuckdbSource.create_empty_database(str(db_path))
    return source


class TestFindSourceWithDuckDB:
    """Tests for _find_source function with DuckDB sources."""

    def test_find_duckdb_source(self, duckdb_source):
        """Test that _find_source can find DuckDB sources."""
        sources = [duckdb_source]
        found = _find_source(sources, "test_duckdb")

        # This will fail with the current implementation
        assert found is not None
        assert found.name == "test_duckdb"
        assert found.type == "duckdb"

    def test_find_source_returns_none_for_nonexistent(self, duckdb_source):
        """Test that _find_source returns None for non-existent sources."""
        sources = [duckdb_source]
        found = _find_source(sources, "nonexistent")

        assert found is None


class TestGetSourceDatabases:
    """Tests for get_source_databases function with DuckDB sources."""

    def test_get_databases_for_duckdb_source(self, duckdb_source):
        """Test that get_source_databases works with DuckDB sources."""
        sources = [duckdb_source]
        result = get_source_databases(sources, "test_duckdb")

        # Should not be an error tuple
        assert not isinstance(result, tuple)

        # Should return success response
        assert result["source"] == "test_duckdb"
        assert result["status"] == "connected"
        assert "databases" in result
        assert isinstance(result["databases"], list)

        # DuckDB should return at least "main" database
        database_names = [db["name"] for db in result["databases"]]
        assert "main" in database_names

    def test_get_databases_returns_404_for_nonexistent_source(self, duckdb_source):
        """Test that get_source_databases returns 404 for non-existent sources."""
        sources = [duckdb_source]
        result = get_source_databases(sources, "nonexistent")

        # Should return an error tuple (dict, status_code)
        assert isinstance(result, tuple)
        assert result[1] == 404
        assert "error" in result[0]
