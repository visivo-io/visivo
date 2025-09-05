"""Test the refactored dimension extraction architecture."""

import pytest
from unittest.mock import Mock, patch
from visivo.models.sources.duckdb_source import DuckdbSource
from visivo.models.sources.sqlalchemy_source import SqlalchemySource
from visivo.models.sources.csv_source import CSVFileSource
from visivo.models.sources.excel_source import ExcelFileSource
from visivo.models.models.sql_model import SqlModel
from visivo.models.models.csv_script_model import CsvScriptModel
from visivo.jobs.extract_dimensions_job import extract_dimensions_for_model
import tempfile
import os


class TestDimensionExtractionArchitecture:
    """Test that all sources properly implement get_model_schema."""

    def test_duckdb_source_get_model_schema(self, tmp_path):
        """Test that DuckdbSource.get_model_schema works with native connections."""
        # Create a test DuckDB database
        db_path = tmp_path / "test.duckdb"

        source = DuckdbSource(name="test_duckdb", type="duckdb", database=str(db_path))

        # Create the database and a test table
        import duckdb

        conn = duckdb.connect(str(db_path))
        conn.execute(
            """
            CREATE TABLE test_table (
                id INTEGER,
                name VARCHAR,
                amount DECIMAL(10,2),
                created_at TIMESTAMP
            )
        """
        )
        conn.close()

        # Test get_model_schema with table name
        schema = source.get_model_schema(table_name="test_table")

        assert "id" in schema
        assert "name" in schema
        assert "amount" in schema
        assert "created_at" in schema

        # Test with SQL query
        schema = source.get_model_schema(model_sql="SELECT id, name FROM test_table")

        assert "id" in schema
        assert "name" in schema
        assert "amount" not in schema  # Should only have selected columns

    def test_csv_source_get_model_schema(self, tmp_path):
        """Test that CSVFileSource.get_model_schema works with DuckDB in-memory."""
        # Create a test CSV file
        csv_path = tmp_path / "test.csv"
        csv_path.write_text("id,name,value\n1,Alice,100.5\n2,Bob,200.75")

        source = CSVFileSource(name="test_csv", type="csv", file=str(csv_path))

        # Test get_model_schema - CSV sources use the source name as table
        schema = source.get_model_schema()

        assert "id" in schema
        assert "name" in schema
        assert "value" in schema

    def test_excel_source_get_model_schema(self, tmp_path):
        """Test that ExcelFileSource.get_model_schema works with DuckDB in-memory."""
        # Create a test CSV file (Excel source actually reads CSV in this implementation)
        csv_path = tmp_path / "test.csv"
        csv_path.write_text("id,name,value\n1,Alice,100.5\n2,Bob,200.75")

        source = ExcelFileSource(name="test_excel", type="xls", file=str(csv_path))

        # Test get_model_schema
        schema = source.get_model_schema()

        assert "id" in schema
        assert "name" in schema
        assert "value" in schema

    @patch("visivo.models.sources.sqlalchemy_source.SqlalchemySource.connect")
    def test_sqlalchemy_source_get_model_schema(self, mock_connect):
        """Test that SqlalchemySource.get_model_schema works with text() wrapper."""
        # Mock a PostgreSQL source
        from visivo.models.sources.postgresql_source import PostgresqlSource

        source = PostgresqlSource(
            name="test_pg",
            type="postgresql",
            host="localhost",
            port=5432,
            database="testdb",
            username="user",
            password="pass",
        )

        # Mock the connection and result
        mock_conn = Mock()
        mock_result = Mock()
        mock_result.cursor.description = [
            ("id", "INTEGER"),
            ("name", "VARCHAR"),
            ("amount", "NUMERIC"),
        ]
        mock_result.keys.return_value = []
        mock_result.fetchall.return_value = []

        mock_conn.__enter__ = Mock(return_value=mock_conn)
        mock_conn.__exit__ = Mock(return_value=None)
        mock_conn.execute.return_value = mock_result
        mock_connect.return_value = mock_conn

        # Test get_model_schema
        schema = source.get_model_schema(table_name="test_table")

        # Verify text() wrapper was used (SqlalchemySource uses it)
        assert mock_conn.execute.called
        call_args = mock_conn.execute.call_args[0][0]

        # Check the query contains expected SQL
        assert "SELECT * FROM test_table LIMIT 0" in str(call_args)

        # Check schema was extracted
        assert schema == {"id": "INTEGER", "name": "VARCHAR", "amount": "NUMERIC"}

    def test_extract_dimensions_uses_get_model_schema(self, tmp_path):
        """Test that extract_dimensions_for_model uses the new architecture."""
        # Create a mock model and source
        model = Mock(spec=SqlModel)
        model.name = "test_model"
        model.sql = "SELECT * FROM test_table"
        model.dimensions = []

        source = Mock()
        source.get_model_schema = Mock(
            return_value={"id": "INTEGER", "name": "VARCHAR", "amount": "DECIMAL"}
        )

        # Call extract_dimensions_for_model
        extract_dimensions_for_model(model, source)

        # Verify get_model_schema was called with model SQL
        source.get_model_schema.assert_called_once_with(model_sql="SELECT * FROM test_table")

        # Verify implicit dimensions were created
        assert hasattr(model, "_implicit_dimensions")
        assert len(model._implicit_dimensions) == 3

        dim_names = {d.name for d in model._implicit_dimensions}
        assert dim_names == {"id", "name", "amount"}

        # Check dimension types
        dim_types = {d.name: d.data_type for d in model._implicit_dimensions}
        assert dim_types == {"id": "INTEGER", "name": "VARCHAR", "amount": "DECIMAL"}

    def test_no_text_wrapper_for_duckdb(self, tmp_path):
        """Verify DuckDB doesn't use text() wrapper which would cause errors."""
        db_path = tmp_path / "test.duckdb"

        source = DuckdbSource(name="test_duckdb", type="duckdb", database=str(db_path))

        # Create database with table
        import duckdb

        conn = duckdb.connect(str(db_path))
        conn.execute("CREATE TABLE test (id INTEGER)")
        conn.close()

        # This should work without text() wrapper issues
        schema = source.get_model_schema(table_name="test")
        assert "id" in schema

        # If text() was used, DuckDB would throw:
        # "Invalid Input Error: Please provide either a DuckDBPyStatement or a string"
        # But our implementation passes plain strings, so it works!
