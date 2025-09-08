import pytest
from unittest.mock import Mock, patch, MagicMock
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
from visivo.server.source_metadata import (
    check_source_connection,
    get_source_databases,
    get_database_schemas,
    get_schema_tables,
    get_table_columns,
    gather_source_metadata,
    validate_source_from_config,
)


class TestSourceMetadata:
    """Test suite for source_metadata module functions."""

    def setup_method(self):
        """Set up test fixtures."""
        # Create mock SqlalchemySource
        self.mock_source = Mock()
        self.mock_source.name = "test_source"
        self.mock_source.type = "postgresql"
        self.mock_source.database = "test_db"

        # Patch isinstance to recognize our mocks as SqlalchemySource
        self.isinstance_patcher = patch("visivo.server.source_metadata.isinstance")
        self.mock_isinstance = self.isinstance_patcher.start()

        def isinstance_side_effect(obj, cls):
            from visivo.models.sources.sqlalchemy_source import SqlalchemySource

            if cls == SqlalchemySource and hasattr(obj, "name") and hasattr(obj, "type"):
                return True
            return isinstance.__wrapped__(obj, cls)

        self.mock_isinstance.side_effect = isinstance_side_effect

    def teardown_method(self):
        """Clean up patches."""
        self.isinstance_patcher.stop()

    def test_test_source_connection_success(self):
        """Test successful source connection test."""
        # Setup - the new simplified logic uses read_sql first
        self.mock_source.read_sql = Mock(return_value=[{"test": 1}])
        sources = [self.mock_source]

        # Execute
        with patch("visivo.server.source_metadata.Logger"):
            result = check_source_connection(sources, "test_source")

        # Assert
        assert result == {"source": "test_source", "status": "connected"}
        self.mock_source.read_sql.assert_called_once_with("SELECT 1 as test_column LIMIT 1")

    def test_test_source_connection_with_read_only_param(self):
        """Test connection test using read_sql method."""
        # Setup - simplified logic now uses read_sql directly
        self.mock_source.read_sql = Mock(return_value=[{"test": 1}])
        sources = [self.mock_source]

        # Execute
        with patch("visivo.server.source_metadata.Logger"):
            result = check_source_connection(sources, "test_source")

        # Assert
        assert result == {"source": "test_source", "status": "connected"}
        self.mock_source.read_sql.assert_called_once_with("SELECT 1 as test_column LIMIT 1")

    def test_test_source_connection_failure(self):
        """Test failed source connection test."""

        # Setup - the new simplified logic uses read_sql first, so make it fail
        self.mock_source.read_sql = Mock(side_effect=Exception("Connection failed"))
        sources = [self.mock_source]

        # Execute
        with patch("visivo.server.source_metadata.Logger"):
            result = check_source_connection(sources, "test_source")

        # Assert
        assert result["source"] == "test_source"
        assert result["status"] == "connection_failed"
        assert "Connection failed" in result["error"]

    def test_test_source_connection_not_found(self):
        """Test connection test with non-existent source."""
        sources = [self.mock_source]

        result = check_source_connection(sources, "non_existent")

        assert result == ({"error": "Source 'non_existent' not found"}, 404)

    def test_test_source_connection_fallback_to_connect(self):
        """Test connection test fallback to connect() when read_sql is not available."""
        # Setup - no read_sql method, should fall back to connect()
        self.mock_source.read_sql = Mock(
            side_effect=AttributeError("'MockSource' object has no attribute 'read_sql'")
        )

        # Mock the connect method
        mock_conn = Mock()
        self.mock_source.connect.return_value.__enter__ = Mock(return_value=mock_conn)
        self.mock_source.connect.return_value.__exit__ = Mock(return_value=None)

        sources = [self.mock_source]

        # Execute
        with patch("visivo.server.source_metadata.Logger"):
            result = check_source_connection(sources, "test_source")

        # Assert
        assert result == {"source": "test_source", "status": "connected"}
        self.mock_source.read_sql.assert_called_once_with("SELECT 1 as test_column LIMIT 1")
        self.mock_source.connect.assert_called_once()

    def test_get_source_databases_success(self):
        """Test successful database listing."""
        # Setup
        self.mock_source.list_databases = Mock(return_value=["db1", "db2", "db3"])
        sources = [self.mock_source]

        # Execute
        with patch("visivo.server.source_metadata.Logger"):
            result = get_source_databases(sources, "test_source")

        # Assert
        assert result == {
            "source": "test_source",
            "databases": [{"name": "db1"}, {"name": "db2"}, {"name": "db3"}],
            "status": "connected",
        }

    def test_get_source_databases_failure(self):
        """Test failed database listing."""
        # Setup
        self.mock_source.list_databases = Mock(side_effect=Exception("Access denied"))
        sources = [self.mock_source]

        # Execute
        with patch("visivo.server.source_metadata.Logger"):
            result = get_source_databases(sources, "test_source")

        # Assert
        assert result["source"] == "test_source"
        assert result["databases"] == []
        assert result["status"] == "connection_failed"
        assert "Access denied" in result["error"]

    def test_get_source_databases_not_found(self):
        """Test database listing with non-existent source."""
        sources = [self.mock_source]

        result = get_source_databases(sources, "non_existent")

        assert result == ({"error": "Source 'non_existent' not found"}, 404)

    def test_get_database_schemas_with_schemas(self):
        """Test schema listing for database with schemas."""
        # Setup
        mock_engine = Mock()
        mock_conn = Mock()
        mock_engine.connect.return_value.__enter__ = Mock(return_value=mock_conn)
        mock_engine.connect.return_value.__exit__ = Mock(return_value=None)
        mock_engine.dialect.name = "postgresql"

        mock_inspector = Mock()
        mock_inspector.get_schema_names = Mock(return_value=["public", "private", "test"])

        def mock_get_engine(read_only=True):
            return mock_engine

        self.mock_source.get_engine = mock_get_engine
        sources = [self.mock_source]

        # Execute
        with patch("visivo.server.source_metadata.Logger"):
            with patch("sqlalchemy.inspect", return_value=mock_inspector):
                result = get_database_schemas(sources, "test_source", "test_db")

        # Assert
        assert result == {
            "source": "test_source",
            "database": "test_db",
            "schemas": [{"name": "public"}, {"name": "private"}, {"name": "test"}],
            "has_schemas": True,
        }

    def test_get_database_schemas_without_schemas(self):
        """Test schema listing for database without schema support."""
        # Setup
        mock_engine = Mock()
        mock_conn = Mock()
        mock_engine.connect.return_value.__enter__ = Mock(return_value=mock_conn)
        mock_engine.connect.return_value.__exit__ = Mock(return_value=None)
        mock_engine.dialect.name = "sqlite"

        mock_inspector = Mock()
        mock_inspector.get_schema_names = Mock(side_effect=NotImplementedError)

        def mock_get_engine(read_only=True):
            return mock_engine

        self.mock_source.get_engine = mock_get_engine
        sources = [self.mock_source]

        # Execute
        with patch("visivo.server.source_metadata.Logger"):
            with patch("sqlalchemy.inspect", return_value=mock_inspector):
                result = get_database_schemas(sources, "test_source", "test_db")

        # Assert
        assert result == {
            "source": "test_source",
            "database": "test_db",
            "schemas": None,
            "has_schemas": False,
        }

    def test_get_database_schemas_with_database_switch(self):
        """Test schema listing with database context switch."""
        # Setup
        mock_engine = Mock()
        mock_conn = Mock()
        mock_engine.connect.return_value.__enter__ = Mock(return_value=mock_conn)
        mock_engine.connect.return_value.__exit__ = Mock(return_value=None)
        mock_engine.dialect.name = "mysql"

        mock_inspector = Mock()
        mock_inspector.get_schema_names = Mock(return_value=["schema1", "schema2"])

        def mock_get_engine(read_only=True):
            return mock_engine

        self.mock_source.get_engine = mock_get_engine
        self.mock_source.database = "default_db"
        sources = [self.mock_source]

        # Execute
        with patch("visivo.server.source_metadata.Logger"):
            with patch("sqlalchemy.inspect", return_value=mock_inspector):
                result = get_database_schemas(sources, "test_source", "other_db")

        # Assert
        mock_conn.execute.assert_called_once()
        # Check that the SQL text contains USE statement
        call_args = mock_conn.execute.call_args[0][0]
        assert hasattr(call_args, "text") and "USE other_db" in call_args.text
        assert result["schemas"] == [{"name": "schema1"}, {"name": "schema2"}]

    def test_get_schema_tables_success(self):
        """Test successful table listing."""
        # Setup
        mock_engine = Mock()
        mock_conn = Mock()
        mock_engine.connect.return_value.__enter__ = Mock(return_value=mock_conn)
        mock_engine.connect.return_value.__exit__ = Mock(return_value=None)
        mock_engine.dialect.name = "postgresql"

        mock_inspector = Mock()
        mock_inspector.get_table_names = Mock(return_value=["users", "orders", "products"])

        def mock_get_engine(read_only=True):
            return mock_engine

        self.mock_source.get_engine = mock_get_engine
        sources = [self.mock_source]

        # Execute
        with patch("visivo.server.source_metadata.Logger"):
            with patch("sqlalchemy.inspect", return_value=mock_inspector):
                result = get_schema_tables(sources, "test_source", "test_db", "public")

        # Assert
        assert result == {
            "source": "test_source",
            "database": "test_db",
            "schema": "public",
            "tables": [{"name": "users"}, {"name": "orders"}, {"name": "products"}],
        }
        mock_inspector.get_table_names.assert_called_once_with(schema="public")

    def test_get_schema_tables_no_schema(self):
        """Test table listing without schema (SQLite-style)."""
        # Setup
        mock_engine = Mock()
        mock_conn = Mock()
        mock_engine.connect.return_value.__enter__ = Mock(return_value=mock_conn)
        mock_engine.connect.return_value.__exit__ = Mock(return_value=None)
        mock_engine.dialect.name = "sqlite"

        mock_inspector = Mock()
        mock_inspector.get_table_names = Mock(return_value=["table1", "table2"])

        def mock_get_engine(read_only=True):
            return mock_engine

        self.mock_source.get_engine = mock_get_engine
        sources = [self.mock_source]

        # Execute
        with patch("visivo.server.source_metadata.Logger"):
            with patch("sqlalchemy.inspect", return_value=mock_inspector):
                result = get_schema_tables(sources, "test_source", "test_db", None)

        # Assert
        assert result["schema"] is None
        assert len(result["tables"]) == 2
        mock_inspector.get_table_names.assert_called_once_with(schema=None)

    def test_get_table_columns_success(self):
        """Test successful column listing."""
        # Setup
        mock_engine = Mock()
        mock_conn = Mock()
        mock_engine.connect.return_value.__enter__ = Mock(return_value=mock_conn)
        mock_engine.connect.return_value.__exit__ = Mock(return_value=None)
        mock_engine.dialect.name = "postgresql"

        mock_inspector = Mock()
        mock_inspector.get_columns = Mock(
            return_value=[
                {"name": "id", "type": "INTEGER"},
                {"name": "name", "type": "VARCHAR(255)"},
                {"name": "created_at", "type": "TIMESTAMP"},
            ]
        )

        def mock_get_engine(read_only=True):
            return mock_engine

        self.mock_source.get_engine = mock_get_engine
        sources = [self.mock_source]

        # Execute
        with patch("visivo.server.source_metadata.Logger"):
            with patch("sqlalchemy.inspect", return_value=mock_inspector):
                result = get_table_columns(sources, "test_source", "test_db", "users", "public")

        # Assert
        assert result == {
            "source": "test_source",
            "database": "test_db",
            "schema": "public",
            "table": "users",
            "columns": [
                {"name": "id", "type": "INTEGER"},
                {"name": "name", "type": "VARCHAR(255)"},
                {"name": "created_at", "type": "TIMESTAMP"},
            ],
        }
        mock_inspector.get_columns.assert_called_once_with("users", schema="public")

    def test_get_table_columns_with_database_switch(self):
        """Test column listing with database context switch."""
        # Setup
        mock_engine = Mock()
        mock_conn = Mock()
        mock_engine.connect.return_value.__enter__ = Mock(return_value=mock_conn)
        mock_engine.connect.return_value.__exit__ = Mock(return_value=None)
        mock_engine.dialect.name = "snowflake"

        mock_inspector = Mock()
        mock_inspector.get_columns = Mock(return_value=[{"name": "col1", "type": "NUMBER"}])

        def mock_get_engine(read_only=True):
            return mock_engine

        self.mock_source.get_engine = mock_get_engine
        self.mock_source.database = "default_db"
        sources = [self.mock_source]

        # Execute
        with patch("visivo.server.source_metadata.Logger"):
            with patch("sqlalchemy.inspect", return_value=mock_inspector):
                result = get_table_columns(sources, "test_source", "other_db", "table1", "schema1")

        # Assert
        mock_conn.execute.assert_called_once()
        # Check that the SQL text contains USE statement
        call_args = mock_conn.execute.call_args[0][0]
        assert hasattr(call_args, "text") and "USE other_db" in call_args.text

    def test_gather_source_metadata_success(self):
        """Test successful metadata gathering for all sources."""
        # Setup
        mock_metadata = {
            "name": "test_source",
            "type": "postgresql",
            "databases": [
                {"name": "db1", "schemas": [{"name": "public", "tables": ["users", "orders"]}]}
            ],
        }
        self.mock_source.introspect = Mock(return_value=mock_metadata)
        sources = [self.mock_source]

        # Execute
        with patch("visivo.server.source_metadata.Logger"):
            result = gather_source_metadata(sources)

        # Assert
        assert len(result["sources"]) == 1
        assert result["sources"][0]["name"] == "test_source"
        assert result["sources"][0]["status"] == "connected"
        assert "databases" in result["sources"][0]

    def test_gather_source_metadata_with_error_result(self):
        """Test metadata gathering when introspection returns error."""
        # Setup
        mock_error_metadata = {"error": "Access denied to database"}
        self.mock_source.introspect = Mock(return_value=mock_error_metadata)
        sources = [self.mock_source]

        # Execute
        with patch("visivo.server.source_metadata.Logger"):
            result = gather_source_metadata(sources)

        # Assert
        assert len(result["sources"]) == 1
        assert result["sources"][0]["name"] == "test_source"
        assert result["sources"][0]["status"] == "connection_failed"
        assert result["sources"][0]["error"] == "Access denied to database"
        assert result["sources"][0]["databases"] == []

    def test_gather_source_metadata_with_exception(self):
        """Test metadata gathering when introspection raises exception."""
        # Setup
        self.mock_source.introspect = Mock(side_effect=Exception("Connection timeout"))
        sources = [self.mock_source]

        # Execute
        with patch("visivo.server.source_metadata.Logger"):
            result = gather_source_metadata(sources)

        # Assert
        assert len(result["sources"]) == 1
        assert result["sources"][0]["name"] == "test_source"
        assert result["sources"][0]["status"] == "connection_failed"
        assert "Connection timeout" in result["sources"][0]["error"]

    def test_gather_source_metadata_multiple_sources(self):
        """Test metadata gathering with multiple sources."""
        # Setup
        source1 = Mock()
        source1.name = "source1"
        source1.type = "postgresql"
        source1.introspect = Mock(return_value={"name": "source1", "type": "postgresql"})

        source2 = Mock()
        source2.name = "source2"
        source2.type = "mysql"
        source2.introspect = Mock(side_effect=Exception("Failed"))

        sources = [source1, source2]

        # Execute
        with patch("visivo.server.source_metadata.Logger"):
            result = gather_source_metadata(sources)

        # Assert
        assert len(result["sources"]) == 2
        assert result["sources"][0]["status"] == "connected"
        assert result["sources"][1]["status"] == "connection_failed"

    def test_all_functions_handle_non_sqlalchemy_sources(self):
        """Test that all functions skip non-SqlalchemySource objects."""
        # Setup
        non_sqlalchemy_source = Mock()
        non_sqlalchemy_source.name = "not_sqlalchemy"
        sources = [non_sqlalchemy_source]

        # Create a custom isinstance patcher for this test that returns False for non-SqlalchemySource
        with patch("visivo.server.source_metadata.isinstance") as mock_isinstance_local:

            def isinstance_side_effect_local(obj, cls):
                from visivo.models.sources.sqlalchemy_source import SqlalchemySource

                if cls == SqlalchemySource:
                    return False  # This mock is not a SqlalchemySource
                return isinstance.__wrapped__(obj, cls)

            mock_isinstance_local.side_effect = isinstance_side_effect_local

            # Test each function
            assert check_source_connection(sources, "not_sqlalchemy") == (
                {"error": "Source 'not_sqlalchemy' not found"},
                404,
            )
            assert get_source_databases(sources, "not_sqlalchemy") == (
                {"error": "Source 'not_sqlalchemy' not found"},
                404,
            )
            assert get_database_schemas(sources, "not_sqlalchemy", "db") == (
                {"error": "Source 'not_sqlalchemy' not found"},
                404,
            )
            assert get_schema_tables(sources, "not_sqlalchemy", "db") == (
                {"error": "Source 'not_sqlalchemy' not found"},
                404,
            )
            assert get_table_columns(sources, "not_sqlalchemy", "db", "table") == (
                {"error": "Source 'not_sqlalchemy' not found"},
                404,
            )
            assert gather_source_metadata(sources) == {"sources": []}

    def test_validate_source_from_config_sqlite(self):
        """Test validate_source_from_config with SQLite source."""
        # Setup
        source_config = {"name": "test_sqlite", "type": "sqlite", "database": ":memory:"}

        # Execute
        with patch("visivo.server.source_metadata.TypeAdapter") as mock_adapter_class:
            with patch("visivo.server.source_metadata._test_source_connection") as mock_test:
                mock_test.return_value = {"source": "test_sqlite", "status": "connected"}
                mock_adapter = Mock()
                mock_adapter_class.return_value = mock_adapter
                mock_source = Mock()
                mock_adapter.validate_python.return_value = mock_source

                from visivo.models.sources.source import Source

                with patch("visivo.server.source_metadata.isinstance") as mock_isinstance:
                    mock_isinstance.return_value = True

                    result = validate_source_from_config(source_config)

        # Assert
        assert result["status"] == "connected"
        assert result["source"] == "test_sqlite"
        mock_adapter.validate_python.assert_called_once_with(source_config)
        mock_test.assert_called_once()

    def test_validate_source_from_config_invalid_type(self):
        """Test validate_source_from_config with invalid source type."""
        # Setup
        source_config = {"name": "test_invalid", "type": "invalid_type", "database": "test_db"}

        # Execute
        with patch("visivo.server.source_metadata.TypeAdapter") as mock_adapter_class:
            from pydantic import ValidationError

            mock_adapter = Mock()
            mock_adapter_class.return_value = mock_adapter

            # Simulate a ValidationError - use a generic Exception that will be caught
            mock_adapter.validate_python.side_effect = Exception("validation error")

            with patch("visivo.server.source_metadata.Logger"):
                result = validate_source_from_config(source_config)

        # Assert
        assert result["status"] == "connection_failed"
        assert result["error"]  # Just verify some error is returned

    def test_validate_source_from_config_csv(self):
        """Test validate_source_from_config with CSV source."""
        # Setup
        source_config = {"name": "test_csv", "type": "csv", "file": "/path/to/test.csv"}

        # Execute
        with patch("visivo.server.source_metadata.TypeAdapter") as mock_adapter_class:
            with patch("visivo.server.source_metadata._test_source_connection") as mock_test:
                mock_test.return_value = {"source": "test_csv", "status": "connected"}
                mock_adapter = Mock()
                mock_adapter_class.return_value = mock_adapter

                # Create a mock CSV source that has read_sql method
                mock_source = Mock()
                mock_source.read_sql = Mock(return_value=[{"test": 1}])
                mock_adapter.validate_python.return_value = mock_source

                from visivo.models.sources.source import Source

                with patch("visivo.server.source_metadata.isinstance") as mock_isinstance:
                    mock_isinstance.return_value = True

                    result = validate_source_from_config(source_config)

        # Assert
        assert result["status"] == "connected"
        assert result["source"] == "test_csv"
        mock_test.assert_called_once_with(mock_source, "test_csv")
