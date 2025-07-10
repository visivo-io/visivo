import pytest
from unittest.mock import Mock, patch, MagicMock
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
from visivo.server.source_metadata import (
    get_sources_list,
    test_source_connection,
    get_source_databases,
    get_database_schemas,
    get_schema_tables,
    get_table_columns,
    gather_source_metadata,
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
        self.isinstance_patcher = patch('visivo.server.source_metadata.isinstance')
        self.mock_isinstance = self.isinstance_patcher.start()
        
        def isinstance_side_effect(obj, cls):
            from visivo.models.sources.sqlalchemy_source import SqlalchemySource
            if cls == SqlalchemySource and hasattr(obj, 'name') and hasattr(obj, 'type'):
                return True
            return isinstance.__wrapped__(obj, cls)
        
        self.mock_isinstance.side_effect = isinstance_side_effect
    
    def teardown_method(self):
        """Clean up patches."""
        self.isinstance_patcher.stop()

    def test_get_sources_list_with_sqlalchemy_sources(self):
        """Test get_sources_list returns correct source information."""
        # Setup
        sources = [self.mock_source]
        
        # Execute
        result = get_sources_list(sources)
        
        # Assert
        assert result == {
            "sources": [{
                "name": "test_source",
                "type": "postgresql",
                "database": "test_db",
                "status": "unknown"
            }]
        }

    def test_get_sources_list_with_no_database_attr(self):
        """Test get_sources_list handles sources without database attribute."""
        # Setup
        mock_source = Mock()
        mock_source.name = "source_no_db"
        mock_source.type = "bigquery"
        delattr(mock_source, 'database')  # Remove database attribute
        sources = [mock_source]
        
        # Execute
        result = get_sources_list(sources)
        
        # Assert
        assert result == {
            "sources": [{
                "name": "source_no_db",
                "type": "bigquery",
                "database": None,
                "status": "unknown"
            }]
        }

    def test_get_sources_list_empty(self):
        """Test get_sources_list with empty sources list."""
        result = get_sources_list([])
        assert result == {"sources": []}

    def test_test_source_connection_success(self):
        """Test successful source connection test."""
        # Setup
        mock_engine = Mock()
        mock_conn = Mock()
        mock_engine.connect.return_value.__enter__ = Mock(return_value=mock_conn)
        mock_engine.connect.return_value.__exit__ = Mock(return_value=None)
        mock_engine.dialect.name = "postgresql"
        
        # Set up get_engine without __code__ attribute check
        def mock_get_engine(read_only=True):
            return mock_engine
        self.mock_source.get_engine = mock_get_engine
        sources = [self.mock_source]
        
        # Execute
        with patch('visivo.server.source_metadata.Logger'):
            result = test_source_connection(sources, "test_source")
        
        # Assert
        assert result == {"source": "test_source", "status": "connected"}
        mock_conn.execute.assert_called_once()

    def test_test_source_connection_with_read_only_param(self):
        """Test connection test when get_engine accepts read_only parameter."""
        # Setup
        mock_engine = Mock()
        mock_conn = Mock()
        mock_engine.connect.return_value.__enter__ = Mock(return_value=mock_conn)
        mock_engine.connect.return_value.__exit__ = Mock(return_value=None)
        mock_engine.dialect.name = "postgresql"
        
        # Mock get_engine with read_only parameter
        def get_engine_with_read_only(read_only=True):
            return mock_engine
        
        self.mock_source.get_engine = get_engine_with_read_only
        sources = [self.mock_source]
        
        # Execute
        with patch('visivo.server.source_metadata.Logger'):
            result = test_source_connection(sources, "test_source")
        
        # Assert
        assert result == {"source": "test_source", "status": "connected"}

    def test_test_source_connection_failure(self):
        """Test failed source connection test."""
        # Setup
        def mock_get_engine(read_only=True):
            raise OperationalError("Connection failed", None, None)
        self.mock_source.get_engine = mock_get_engine
        sources = [self.mock_source]
        
        # Execute
        with patch('visivo.server.source_metadata.Logger'):
            result = test_source_connection(sources, "test_source")
        
        # Assert
        assert result["source"] == "test_source"
        assert result["status"] == "connection_failed"
        assert "Connection failed" in result["error"]

    def test_test_source_connection_not_found(self):
        """Test connection test with non-existent source."""
        sources = [self.mock_source]
        
        result = test_source_connection(sources, "non_existent")
        
        assert result == ({"error": "Source 'non_existent' not found"}, 404)

    def test_test_source_connection_different_dialects(self):
        """Test connection test for different SQL dialects."""
        dialects = ["snowflake", "mysql", "sqlite", "duckdb", "unknown_dialect"]
        
        for dialect in dialects:
            mock_engine = Mock()
            mock_conn = Mock()
            mock_engine.connect.return_value.__enter__ = Mock(return_value=mock_conn)
            mock_engine.connect.return_value.__exit__ = Mock(return_value=None)
            mock_engine.dialect.name = dialect
            
            def mock_get_engine(read_only=True):
                return mock_engine
            self.mock_source.get_engine = mock_get_engine
            sources = [self.mock_source]
            
            with patch('visivo.server.source_metadata.Logger'):
                result = test_source_connection(sources, "test_source")
            
            assert result == {"source": "test_source", "status": "connected"}
            mock_conn.execute.assert_called_once()
            mock_conn.reset_mock()  # Reset for next iteration

    def test_get_source_databases_success(self):
        """Test successful database listing."""
        # Setup
        self.mock_source.list_databases = Mock(return_value=["db1", "db2", "db3"])
        sources = [self.mock_source]
        
        # Execute
        with patch('visivo.server.source_metadata.Logger'):
            result = get_source_databases(sources, "test_source")
        
        # Assert
        assert result == {
            "source": "test_source",
            "databases": [{"name": "db1"}, {"name": "db2"}, {"name": "db3"}],
            "status": "connected"
        }

    def test_get_source_databases_failure(self):
        """Test failed database listing."""
        # Setup
        self.mock_source.list_databases = Mock(side_effect=Exception("Access denied"))
        sources = [self.mock_source]
        
        # Execute
        with patch('visivo.server.source_metadata.Logger'):
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
        with patch('visivo.server.source_metadata.Logger'):
            with patch('sqlalchemy.inspect', return_value=mock_inspector):
                result = get_database_schemas(sources, "test_source", "test_db")
        
        # Assert
        assert result == {
            "source": "test_source",
            "database": "test_db",
            "schemas": [{"name": "public"}, {"name": "private"}, {"name": "test"}],
            "has_schemas": True
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
        with patch('visivo.server.source_metadata.Logger'):
            with patch('sqlalchemy.inspect', return_value=mock_inspector):
                result = get_database_schemas(sources, "test_source", "test_db")
        
        # Assert
        assert result == {
            "source": "test_source",
            "database": "test_db",
            "schemas": None,
            "has_schemas": False
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
        with patch('visivo.server.source_metadata.Logger'):
            with patch('sqlalchemy.inspect', return_value=mock_inspector):
                result = get_database_schemas(sources, "test_source", "other_db")
        
        # Assert
        mock_conn.execute.assert_called_once()
        # Check that the SQL text contains USE statement
        call_args = mock_conn.execute.call_args[0][0]
        assert hasattr(call_args, 'text') and "USE other_db" in call_args.text
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
        with patch('visivo.server.source_metadata.Logger'):
            with patch('sqlalchemy.inspect', return_value=mock_inspector):
                result = get_schema_tables(sources, "test_source", "test_db", "public")
        
        # Assert
        assert result == {
            "source": "test_source",
            "database": "test_db",
            "schema": "public",
            "tables": [{"name": "users"}, {"name": "orders"}, {"name": "products"}]
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
        with patch('visivo.server.source_metadata.Logger'):
            with patch('sqlalchemy.inspect', return_value=mock_inspector):
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
        mock_inspector.get_columns = Mock(return_value=[
            {"name": "id", "type": "INTEGER"},
            {"name": "name", "type": "VARCHAR(255)"},
            {"name": "created_at", "type": "TIMESTAMP"}
        ])
        
        def mock_get_engine(read_only=True):
            return mock_engine
        self.mock_source.get_engine = mock_get_engine
        sources = [self.mock_source]
        
        # Execute
        with patch('visivo.server.source_metadata.Logger'):
            with patch('sqlalchemy.inspect', return_value=mock_inspector):
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
                {"name": "created_at", "type": "TIMESTAMP"}
            ]
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
        with patch('visivo.server.source_metadata.Logger'):
            with patch('sqlalchemy.inspect', return_value=mock_inspector):
                result = get_table_columns(sources, "test_source", "other_db", "table1", "schema1")
        
        # Assert
        mock_conn.execute.assert_called_once()
        # Check that the SQL text contains USE statement
        call_args = mock_conn.execute.call_args[0][0]
        assert hasattr(call_args, 'text') and "USE other_db" in call_args.text

    def test_gather_source_metadata_success(self):
        """Test successful metadata gathering for all sources."""
        # Setup
        mock_metadata = {
            "name": "test_source",
            "type": "postgresql",
            "databases": [
                {
                    "name": "db1",
                    "schemas": [{"name": "public", "tables": ["users", "orders"]}]
                }
            ]
        }
        self.mock_source.introspect = Mock(return_value=mock_metadata)
        sources = [self.mock_source]
        
        # Execute
        with patch('visivo.server.source_metadata.Logger'):
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
        with patch('visivo.server.source_metadata.Logger'):
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
        with patch('visivo.server.source_metadata.Logger'):
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
        with patch('visivo.server.source_metadata.Logger'):
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
        with patch('visivo.server.source_metadata.isinstance') as mock_isinstance_local:
            def isinstance_side_effect_local(obj, cls):
                from visivo.models.sources.sqlalchemy_source import SqlalchemySource
                if cls == SqlalchemySource:
                    return False  # This mock is not a SqlalchemySource
                return isinstance.__wrapped__(obj, cls)
            
            mock_isinstance_local.side_effect = isinstance_side_effect_local
            
            # Test each function
            assert get_sources_list(sources) == {"sources": []}
            assert test_source_connection(sources, "not_sqlalchemy") == ({"error": "Source 'not_sqlalchemy' not found"}, 404)
            assert get_source_databases(sources, "not_sqlalchemy") == ({"error": "Source 'not_sqlalchemy' not found"}, 404)
            assert get_database_schemas(sources, "not_sqlalchemy", "db") == ({"error": "Source 'not_sqlalchemy' not found"}, 404)
            assert get_schema_tables(sources, "not_sqlalchemy", "db") == ({"error": "Source 'not_sqlalchemy' not found"}, 404)
            assert get_table_columns(sources, "not_sqlalchemy", "db", "table") == ({"error": "Source 'not_sqlalchemy' not found"}, 404)
            assert gather_source_metadata(sources) == {"sources": []}