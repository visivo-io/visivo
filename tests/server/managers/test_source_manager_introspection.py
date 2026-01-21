import pytest
import tempfile
import os
from sqlalchemy import create_engine, text

from visivo.server.managers.source_manager import SourceManager
from tests.factories.model_factories import SourceFactory


class TestSourceManagerIntrospection:
    """Test suite for SourceManager granular introspection methods."""

    @pytest.fixture
    def manager(self):
        """Create a fresh SourceManager for each test."""
        return SourceManager()

    @pytest.fixture
    def db_with_tables(self):
        """Create a real SQLite database with actual tables for testing."""
        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = os.path.join(temp_dir, "test.db")
            engine = create_engine(f"sqlite:///{db_path}")

            with engine.connect() as conn:
                # Create actual test tables
                conn.execute(
                    text(
                        """
                    CREATE TABLE users (
                        id INTEGER PRIMARY KEY,
                        name TEXT NOT NULL,
                        email TEXT
                    )
                """
                    )
                )
                conn.execute(
                    text(
                        """
                    CREATE TABLE orders (
                        id INTEGER PRIMARY KEY,
                        user_id INTEGER,
                        total REAL
                    )
                """
                    )
                )
                conn.execute(
                    text("INSERT INTO users (name, email) VALUES ('Alice', 'alice@test.com')")
                )
                conn.execute(text("INSERT INTO users (name, email) VALUES ('Bob', 'bob@test.com')"))
                conn.execute(text("INSERT INTO orders (user_id, total) VALUES (1, 99.99)"))
                conn.execute(text("INSERT INTO orders (user_id, total) VALUES (1, 50.00)"))
                conn.execute(text("INSERT INTO orders (user_id, total) VALUES (2, 25.50)"))
                conn.commit()

            yield db_path

    @pytest.fixture
    def sqlite_source(self, db_with_tables):
        """Real SqliteSource pointing to real database with tables."""
        return SourceFactory.build(name="test_source", database=db_with_tables)

    # --- Tests for get_databases ---

    def test_get_databases_success(self, manager, sqlite_source):
        """Test list_databases against real SQLite database."""
        manager.save("test_source", sqlite_source)

        result = manager.get_databases("test_source")

        assert result["status"] == "connected"
        assert {"name": "main"} in result["databases"]

    def test_get_databases_not_found(self, manager):
        """Test error handling for nonexistent source."""
        result = manager.get_databases("nonexistent")

        assert "error" in result
        assert "not found" in result["error"]
        assert result["status"] == "not_found"

    # --- Tests for get_schemas ---

    def test_get_schemas_success(self, manager, sqlite_source):
        """Test get_schemas against real SQLite database."""
        manager.save("test_source", sqlite_source)

        result = manager.get_schemas("test_source", "main")

        assert result["status"] == "connected"
        assert result["database"] == "main"
        # SQLite typically has 'main' schema
        assert isinstance(result["schemas"], list)

    def test_get_schemas_not_found(self, manager):
        """Test error handling for nonexistent source."""
        result = manager.get_schemas("nonexistent", "main")

        assert "error" in result
        assert "not found" in result["error"]
        assert result["status"] == "not_found"

    # --- Tests for get_tables ---

    def test_get_tables_returns_real_tables(self, manager, sqlite_source):
        """Test that introspection finds actual tables in the database."""
        manager.save("test_source", sqlite_source)

        result = manager.get_tables("test_source", "main")

        assert result["status"] == "connected"
        table_names = [t["name"] for t in result["tables"]]
        assert "users" in table_names
        assert "orders" in table_names

    def test_get_tables_includes_type(self, manager, sqlite_source):
        """Test that tables have type information."""
        manager.save("test_source", sqlite_source)

        result = manager.get_tables("test_source", "main")

        for table in result["tables"]:
            assert "type" in table
            assert table["type"] in ["table", "view"]

    def test_get_tables_not_found(self, manager):
        """Test error handling for nonexistent source."""
        result = manager.get_tables("nonexistent", "main")

        assert "error" in result
        assert "not found" in result["error"]
        assert result["status"] == "not_found"

    # --- Tests for get_columns ---

    def test_get_columns_returns_real_columns(self, manager, sqlite_source):
        """Test that introspection finds actual columns."""
        manager.save("test_source", sqlite_source)

        result = manager.get_columns("test_source", "main", "users")

        assert result["status"] == "connected"
        column_names = [c["name"] for c in result["columns"]]
        assert "id" in column_names
        assert "name" in column_names
        assert "email" in column_names

    def test_get_columns_includes_type_info(self, manager, sqlite_source):
        """Test that columns have type and nullable information."""
        manager.save("test_source", sqlite_source)

        result = manager.get_columns("test_source", "main", "users")

        for col in result["columns"]:
            assert "name" in col
            assert "type" in col
            assert "nullable" in col

    def test_get_columns_not_found(self, manager):
        """Test error handling for nonexistent source."""
        result = manager.get_columns("nonexistent", "main", "users")

        assert "error" in result
        assert "not found" in result["error"]
        assert result["status"] == "not_found"

    # --- Tests for get_table_preview ---

    def test_get_table_preview_returns_real_data(self, manager, sqlite_source):
        """Test that preview returns actual row data."""
        manager.save("test_source", sqlite_source)

        result = manager.get_table_preview("test_source", "main", "users", limit=10)

        assert result["status"] == "connected"
        assert result["row_count"] >= 1
        assert "Alice" in str(result["rows"])

    def test_get_table_preview_includes_columns(self, manager, sqlite_source):
        """Test that preview includes column names."""
        manager.save("test_source", sqlite_source)

        result = manager.get_table_preview("test_source", "main", "users")

        assert "columns" in result
        assert "id" in result["columns"]
        assert "name" in result["columns"]

    def test_get_table_preview_respects_limit(self, manager, sqlite_source):
        """Test that limit parameter works correctly."""
        manager.save("test_source", sqlite_source)

        result = manager.get_table_preview("test_source", "main", "users", limit=1)

        assert result["row_count"] == 1

    def test_get_table_preview_clamps_limit_high(self, manager, sqlite_source):
        """Test that limit is clamped to max 1000."""
        manager.save("test_source", sqlite_source)

        # Even with limit=5000, actual results are capped
        result = manager.get_table_preview("test_source", "main", "users", limit=5000)

        # Should succeed without error
        assert result["status"] == "connected"

    def test_get_table_preview_clamps_limit_low(self, manager, sqlite_source):
        """Test that limit is clamped to min 1."""
        manager.save("test_source", sqlite_source)

        # Even with limit=0, should return at least 1 row
        result = manager.get_table_preview("test_source", "main", "users", limit=0)

        # Should succeed and return at least 1 row
        assert result["status"] == "connected"
        assert result["row_count"] >= 1

    def test_get_table_preview_not_found(self, manager):
        """Test error handling for nonexistent source."""
        result = manager.get_table_preview("nonexistent", "main", "users")

        assert "error" in result
        assert "not found" in result["error"]
        assert result["status"] == "not_found"

    # --- Tests for cached vs published sources ---

    def test_introspection_works_with_cached_source(self, manager, sqlite_source):
        """Cached (draft) source should be accessible for introspection."""
        manager.save("cached", sqlite_source)

        result = manager.get_databases("cached")

        assert result["status"] == "connected"

    def test_introspection_works_with_published_source(self, manager, sqlite_source):
        """Published source should be accessible for introspection."""
        manager._published_objects["published"] = sqlite_source

        result = manager.get_databases("published")

        assert result["status"] == "connected"

    def test_cached_prioritized_over_published_for_introspection(self, manager, db_with_tables):
        """Cached source should be used for introspection over published."""
        # Create two different sources
        published_source = SourceFactory.build(name="test", database=":memory:")
        cached_source = SourceFactory.build(name="test", database=db_with_tables)

        manager._published_objects["test"] = published_source
        manager.save("test", cached_source)

        # Introspection should use cached source (which has tables)
        result = manager.get_tables("test", "main")

        assert result["status"] == "connected"
        table_names = [t["name"] for t in result["tables"]]
        # Cached source has tables, published (:memory:) would not
        assert "users" in table_names

    # --- Tests for error handling ---

    def test_get_tables_connection_error(self, manager):
        """Test that connection errors are handled gracefully."""
        # Create source with invalid database path
        bad_source = SourceFactory.build(
            name="bad_source", database="/nonexistent/path/to/database.db"
        )
        manager.save("bad_source", bad_source)

        result = manager.get_tables("bad_source", "main")

        assert "error" in result
        assert result["status"] == "connection_failed"

    def test_get_columns_connection_error(self, manager):
        """Test that connection errors are handled gracefully."""
        bad_source = SourceFactory.build(
            name="bad_source", database="/nonexistent/path/to/database.db"
        )
        manager.save("bad_source", bad_source)

        result = manager.get_columns("bad_source", "main", "users")

        assert "error" in result
        assert result["status"] == "connection_failed"
