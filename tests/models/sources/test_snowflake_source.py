from unittest.mock import MagicMock, patch
import pytest
from sqlglot.schema import MappingSchema
from sqlglot import exp

from visivo.models.sources.snowflake_source import SnowflakeSource


def test_SnowflakeSource_simple_data():
    data = {"name": "source", "database": "database", "type": "snowflake"}
    source = SnowflakeSource(**data)
    assert source.name == "source"


def test_SnowflakeSource_key_authentication():
    data = {
        "name": "source",
        "database": "database",
        "type": "snowflake",
        "private_key_path": "tests/fixtures/key_with_password.p8",
        "private_key_passphrase": "password",
    }
    source = SnowflakeSource(**data)
    assert source.name == "source"
    assert source.private_key_path == "tests/fixtures/key_with_password.p8"
    assert "0\\" in str(source.connect_args()["private_key"])


def test_SnowflakeSource_key_authentication_no_passphrase():
    data = {
        "name": "source",
        "database": "database",
        "type": "snowflake",
        "private_key_path": "tests/fixtures/key_without_password.p8",
    }
    source = SnowflakeSource(**data)
    assert source.name == "source"
    assert source.private_key_path == "tests/fixtures/key_without_password.p8"
    assert "0\\" in str(source.connect_args()["private_key"])


class TestSnowflakeSourceGetSchema:
    """Tests for the optimized get_schema() method using INFORMATION_SCHEMA."""

    def create_mock_connection(self, columns_rows):
        """Create a mock connection that returns specified data."""
        mock_conn = MagicMock()
        mock_context = MagicMock()
        mock_context.__enter__ = MagicMock(return_value=mock_conn)
        mock_context.__exit__ = MagicMock(return_value=False)

        # Create mock result object for the columns query
        def execute_side_effect(query, params=None):
            mock_result = MagicMock()
            mock_result.fetchall.return_value = columns_rows
            return mock_result

        mock_conn.execute.side_effect = execute_side_effect
        return mock_context

    def test_get_schema_returns_correct_structure(self):
        """Test that get_schema returns the expected structure."""
        source = SnowflakeSource(
            name="test_snowflake", database="TEST_DB", db_schema="TEST_SCHEMA", type="snowflake"
        )

        # Mock data for columns query (single query now gets everything)
        # Format: TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT,
        #         NUMERIC_PRECISION, NUMERIC_SCALE, CHARACTER_MAXIMUM_LENGTH
        columns_rows = [
            ("USERS", "ID", "NUMBER", "NO", None, 38, 0, None),
            ("USERS", "NAME", "VARCHAR", "YES", None, None, None, 100),
            ("USERS", "EMAIL", "VARCHAR", "YES", None, None, None, 255),
            ("ORDERS", "ORDER_ID", "NUMBER", "NO", None, 38, 0, None),
            ("ORDERS", "USER_ID", "NUMBER", "YES", None, 38, 0, None),
            ("ORDERS", "AMOUNT", "NUMBER", "YES", None, 10, 2, None),
        ]

        mock_conn = self.create_mock_connection(columns_rows)

        with patch.object(SnowflakeSource, "get_connection", return_value=mock_conn):
            schema = source.get_schema()

        # Verify structure
        assert isinstance(schema, dict)
        assert "tables" in schema
        assert "sqlglot_schema" in schema
        assert "metadata" in schema

        # Verify metadata
        metadata = schema["metadata"]
        assert metadata["source_type"] == "snowflake"
        assert metadata["source_dialect"] == "snowflake"
        assert metadata["database"] == "TEST_DB"
        assert metadata["schema"] == "TEST_SCHEMA"
        assert metadata["total_tables"] == 2
        assert metadata["total_columns"] == 6

        # Verify tables
        tables = schema["tables"]
        assert "USERS" in tables
        assert "ORDERS" in tables

        # Verify USERS table columns
        users_table = tables["USERS"]
        assert "columns" in users_table
        assert "metadata" in users_table
        assert users_table["metadata"]["table_name"] == "USERS"
        assert users_table["metadata"]["column_count"] == 3

        users_columns = users_table["columns"]
        assert "ID" in users_columns
        assert "NAME" in users_columns
        assert "EMAIL" in users_columns

        # Verify column details
        id_col = users_columns["ID"]
        assert id_col["type"] == "NUMBER(38)"
        assert id_col["nullable"] is False
        assert "sqlglot_datatype" in id_col
        assert isinstance(id_col["sqlglot_datatype"], exp.DataType)

        name_col = users_columns["NAME"]
        assert name_col["type"] == "VARCHAR(100)"
        assert name_col["nullable"] is True

        # Verify ORDERS table
        orders_table = tables["ORDERS"]
        assert orders_table["metadata"]["column_count"] == 3

        amount_col = orders_table["columns"]["AMOUNT"]
        assert amount_col["type"] == "NUMBER(10,2)"

        # Verify SQLGlot schema
        sqlglot_schema = schema["sqlglot_schema"]
        assert isinstance(sqlglot_schema, MappingSchema)
        # SQLGlot normalizes table names to lowercase
        mapping_keys = list(sqlglot_schema.mapping.keys())
        assert "users" in mapping_keys or "USERS" in mapping_keys
        assert "orders" in mapping_keys or "ORDERS" in mapping_keys

    def test_get_schema_with_table_filter(self):
        """Test that get_schema correctly filters to specified tables."""
        source = SnowflakeSource(
            name="test_snowflake", database="TEST_DB", db_schema="TEST_SCHEMA", type="snowflake"
        )

        # Mock data - includes all tables, but we'll filter to USERS only
        columns_rows = [
            ("USERS", "ID", "NUMBER", "NO", None, 38, 0, None),
            ("USERS", "NAME", "VARCHAR", "YES", None, None, None, 100),
            ("ORDERS", "ORDER_ID", "NUMBER", "NO", None, 38, 0, None),
        ]

        mock_conn = self.create_mock_connection(columns_rows)

        with patch.object(SnowflakeSource, "get_connection", return_value=mock_conn):
            schema = source.get_schema(table_names=["USERS"])

        # Verify only USERS is included (ORDERS filtered out)
        assert "USERS" in schema["tables"]
        assert "ORDERS" not in schema["tables"]
        assert schema["metadata"]["total_tables"] == 1
        assert schema["metadata"]["total_columns"] == 2

    def test_get_schema_empty_database(self):
        """Test that get_schema handles empty databases correctly."""
        source = SnowflakeSource(
            name="test_snowflake", database="EMPTY_DB", db_schema="EMPTY_SCHEMA", type="snowflake"
        )

        mock_conn = self.create_mock_connection(columns_rows=[])

        with patch.object(SnowflakeSource, "get_connection", return_value=mock_conn):
            schema = source.get_schema()

        # Verify empty structure
        assert schema["tables"] == {}
        assert schema["metadata"]["total_tables"] == 0
        assert schema["metadata"]["total_columns"] == 0
        assert isinstance(schema["sqlglot_schema"], MappingSchema)

    def test_get_schema_handles_connection_error(self):
        """Test that get_schema handles connection errors gracefully."""
        source = SnowflakeSource(
            name="test_snowflake", database="TEST_DB", db_schema="TEST_SCHEMA", type="snowflake"
        )

        with patch.object(
            SnowflakeSource, "get_connection", side_effect=Exception("Connection failed")
        ):
            schema = source.get_schema()

        # When connection fails in _get_available_tables_for_schema, it returns empty list
        # and the main method returns early with empty schema (not an error state)
        assert schema["tables"] == {}
        assert schema["metadata"]["total_tables"] == 0
        assert schema["metadata"]["total_columns"] == 0

    def test_get_schema_default_schema_public(self):
        """Test that get_schema uses PUBLIC as default schema when db_schema is not set."""
        source = SnowflakeSource(name="test_snowflake", database="TEST_DB", type="snowflake")

        columns_rows = [("TEST_TABLE", "COL1", "VARCHAR", "YES", None, None, None, 50)]

        mock_conn = self.create_mock_connection(columns_rows)

        with patch.object(SnowflakeSource, "get_connection", return_value=mock_conn):
            schema = source.get_schema()

        assert schema["metadata"]["schema"] == "PUBLIC"

    def test_get_schema_type_mapping(self):
        """Test that various Snowflake data types are correctly mapped."""
        source = SnowflakeSource(
            name="test_snowflake", database="TEST_DB", db_schema="TEST_SCHEMA", type="snowflake"
        )

        # Test various Snowflake data types
        columns_rows = [
            ("TYPE_TEST", "INT_COL", "NUMBER", "YES", None, 38, 0, None),
            ("TYPE_TEST", "DECIMAL_COL", "NUMBER", "YES", None, 10, 2, None),
            ("TYPE_TEST", "VARCHAR_COL", "VARCHAR", "YES", None, None, None, 255),
            ("TYPE_TEST", "TEXT_COL", "TEXT", "YES", None, None, None, None),
            ("TYPE_TEST", "BOOLEAN_COL", "BOOLEAN", "YES", None, None, None, None),
            ("TYPE_TEST", "DATE_COL", "DATE", "YES", None, None, None, None),
            ("TYPE_TEST", "TIMESTAMP_COL", "TIMESTAMP_NTZ", "YES", None, None, None, None),
            ("TYPE_TEST", "FLOAT_COL", "FLOAT", "YES", None, None, None, None),
        ]

        mock_conn = self.create_mock_connection(columns_rows)

        with patch.object(SnowflakeSource, "get_connection", return_value=mock_conn):
            schema = source.get_schema()

        columns = schema["tables"]["TYPE_TEST"]["columns"]

        # Verify types are correctly constructed
        assert columns["INT_COL"]["type"] == "NUMBER(38)"
        assert columns["DECIMAL_COL"]["type"] == "NUMBER(10,2)"
        assert columns["VARCHAR_COL"]["type"] == "VARCHAR(255)"
        assert columns["TEXT_COL"]["type"] == "TEXT"  # No length modifier
        assert columns["BOOLEAN_COL"]["type"] == "BOOLEAN"
        assert columns["DATE_COL"]["type"] == "DATE"
        assert columns["TIMESTAMP_COL"]["type"] == "TIMESTAMP_NTZ"
        assert columns["FLOAT_COL"]["type"] == "FLOAT"

        # Verify all have SQLGlot datatype
        for col_name, col_info in columns.items():
            assert "sqlglot_datatype" in col_info
            assert isinstance(col_info["sqlglot_datatype"], exp.DataType)
