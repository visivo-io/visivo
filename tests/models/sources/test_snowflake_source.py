from unittest.mock import MagicMock, patch
import pytest
from sqlglot.schema import MappingSchema
from sqlglot import exp

from visivo.models.sources.snowflake_source import SnowflakeSource


def test_SnowflakeSource_simple_data():
    data = {"name": "source", "database": "database", "type": "snowflake"}
    source = SnowflakeSource(**data)
    assert source.name == "source"


# B5 regression: ${env.X} on connection-relevant fields must reach the snowflake URL
# attributes already resolved. Before this fix, account/warehouse/role/timezone were
# typed Optional[str] AND read directly inside url(), so the literal "${env.…}"
# string ended up in the URL and every Snowflake query 404'd at the connector.
@pytest.mark.parametrize(
    "field,env_var,expected",
    [
        ("account", "SF_ACCOUNT", "ab12345.us-west-1.aws"),
        ("warehouse", "SF_WAREHOUSE", "TEST_WH"),
        ("role", "SF_ROLE", "TEST_ROLE"),
        ("timezone", "SF_TIMEZONE", "UTC"),
        # username / password / database already worked — included for symmetry
        # so a future regression on the base-class fields also surfaces here.
        ("username", "SF_USER", "test_user"),
        ("password", "SF_PASSWORD", "test_pw"),
        ("database", "SF_DATABASE", "TEST_DB"),
    ],
)
def test_env_var_resolves_in_url_attributes(monkeypatch, field, env_var, expected):
    """Every connection-relevant field must resolve ${env.X} before url() builds attrs."""
    monkeypatch.setenv("SF_ACCOUNT", "ab12345.us-west-1.aws")
    monkeypatch.setenv("SF_USER", "test_user")
    monkeypatch.setenv("SF_PASSWORD", "test_pw")
    monkeypatch.setenv("SF_WAREHOUSE", "TEST_WH")
    monkeypatch.setenv("SF_ROLE", "TEST_ROLE")
    monkeypatch.setenv("SF_DATABASE", "TEST_DB")
    monkeypatch.setenv("SF_TIMEZONE", "UTC")

    src = SnowflakeSource(
        name="t",
        type="snowflake",
        account="${env.SF_ACCOUNT}",
        username="${env.SF_USER}",
        password="${env.SF_PASSWORD}",
        warehouse="${env.SF_WAREHOUSE}",
        role="${env.SF_ROLE}",
        database="${env.SF_DATABASE}",
        timezone="${env.SF_TIMEZONE}",
    )

    with patch("snowflake.sqlalchemy.URL") as mock_url:
        src.url()
        attrs = mock_url.call_args.kwargs

    # snowflake-sqlalchemy uses `user` rather than `username`; everything else maps 1:1.
    url_key = {"username": "user"}.get(field, field)
    assert attrs[url_key] == expected, (
        f"Expected {url_key}={expected!r} but got {attrs.get(url_key)!r}. "
        f"Likely the field type isn't StringOrEnvVar or url() reads it directly "
        f"without _resolve_field()."
    )
    assert "${env." not in str(attrs[url_key]), (
        f"Literal ${{env.…}} placeholder leaked into url attribute {url_key!r}: "
        f"{attrs[url_key]!r}. Fix _resolve_field wiring in SnowflakeSource.url()."
    )


def test_get_account_warehouse_role_timezone_resolve_env_vars(monkeypatch):
    """The four B5 getters must hand back resolved env-var values, not the literal."""
    monkeypatch.setenv("SF_ACCOUNT", "abc123.us-east-1.aws")
    monkeypatch.setenv("SF_WAREHOUSE", "MY_WH")
    monkeypatch.setenv("SF_ROLE", "MY_ROLE")
    monkeypatch.setenv("SF_TIMEZONE", "America/New_York")

    src = SnowflakeSource(
        name="t",
        type="snowflake",
        account="${env.SF_ACCOUNT}",
        warehouse="${env.SF_WAREHOUSE}",
        role="${env.SF_ROLE}",
        timezone="${env.SF_TIMEZONE}",
        database="db",
    )

    assert src.get_account() == "abc123.us-east-1.aws"
    assert src.get_warehouse() == "MY_WH"
    assert src.get_role() == "MY_ROLE"
    assert src.get_timezone() == "America/New_York"


def test_literal_string_values_pass_through_unchanged():
    """Plain (non-env-var) strings still flow through the getters unchanged."""
    src = SnowflakeSource(
        name="t",
        type="snowflake",
        account="abc.us-west-2.aws",
        warehouse="WH",
        role="ROLE",
        timezone="UTC",
        database="db",
    )

    assert src.get_account() == "abc.us-west-2.aws"
    assert src.get_warehouse() == "WH"
    assert src.get_role() == "ROLE"
    assert src.get_timezone() == "UTC"


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
    """Tests for the optimized get_schema() method using INFORMATION_SCHEMA.

    Note: The get_schema method now queries ALL schemas in the database and returns
    a nested structure: {schema: {table: {col: type}}}. Tables are stored with
    qualified names like "SCHEMA.TABLE" in the tables dict.
    """

    def create_mock_connection(self, columns_rows):
        """Create a mock connection that returns specified data.

        columns_rows format (multi-schema):
            (TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT,
             NUMERIC_PRECISION, NUMERIC_SCALE, CHARACTER_MAXIMUM_LENGTH)
        """
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
        """Test that get_schema returns the expected structure with multi-schema support."""
        source = SnowflakeSource(
            name="test_snowflake", database="TEST_DB", db_schema="TEST_SCHEMA", type="snowflake"
        )

        # Mock data for columns query - now includes TABLE_SCHEMA as first column
        # Format: TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT,
        #         NUMERIC_PRECISION, NUMERIC_SCALE, CHARACTER_MAXIMUM_LENGTH
        columns_rows = [
            ("TEST_SCHEMA", "USERS", "ID", "NUMBER", "NO", None, 38, 0, None),
            ("TEST_SCHEMA", "USERS", "NAME", "VARCHAR", "YES", None, None, None, 100),
            ("TEST_SCHEMA", "USERS", "EMAIL", "VARCHAR", "YES", None, None, None, 255),
            ("TEST_SCHEMA", "ORDERS", "ORDER_ID", "NUMBER", "NO", None, 38, 0, None),
            ("TEST_SCHEMA", "ORDERS", "USER_ID", "NUMBER", "YES", None, 38, 0, None),
            ("TEST_SCHEMA", "ORDERS", "AMOUNT", "NUMBER", "YES", None, 10, 2, None),
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
        assert metadata["default_schema"] == "TEST_SCHEMA"
        assert metadata["total_tables"] == 2
        assert metadata["total_columns"] == 6

        # Verify tables - now use qualified names (SCHEMA.TABLE)
        tables = schema["tables"]
        assert "TEST_SCHEMA.USERS" in tables
        assert "TEST_SCHEMA.ORDERS" in tables

        # Verify USERS table columns
        users_table = tables["TEST_SCHEMA.USERS"]
        assert "columns" in users_table
        assert "metadata" in users_table
        assert users_table["metadata"]["table_name"] == "USERS"
        assert users_table["metadata"]["schema"] == "TEST_SCHEMA"
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
        orders_table = tables["TEST_SCHEMA.ORDERS"]
        assert orders_table["metadata"]["column_count"] == 3

        amount_col = orders_table["columns"]["AMOUNT"]
        assert amount_col["type"] == "NUMBER(10,2)"

        # Verify SQLGlot schema
        sqlglot_schema = schema["sqlglot_schema"]
        assert isinstance(sqlglot_schema, MappingSchema)

    def test_get_schema_with_table_filter(self):
        """Test that get_schema correctly filters to specified tables."""
        source = SnowflakeSource(
            name="test_snowflake", database="TEST_DB", db_schema="TEST_SCHEMA", type="snowflake"
        )

        # Mock data - includes all tables, but we'll filter to USERS only
        columns_rows = [
            ("TEST_SCHEMA", "USERS", "ID", "NUMBER", "NO", None, 38, 0, None),
            ("TEST_SCHEMA", "USERS", "NAME", "VARCHAR", "YES", None, None, None, 100),
            ("TEST_SCHEMA", "ORDERS", "ORDER_ID", "NUMBER", "NO", None, 38, 0, None),
        ]

        mock_conn = self.create_mock_connection(columns_rows)

        with patch.object(SnowflakeSource, "get_connection", return_value=mock_conn):
            schema = source.get_schema(table_names=["USERS"])

        # Verify only USERS is included (ORDERS filtered out)
        assert "TEST_SCHEMA.USERS" in schema["tables"]
        assert "TEST_SCHEMA.ORDERS" not in schema["tables"]
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

        # When connection fails, it returns empty schema (not an error state)
        assert schema["tables"] == {}
        assert schema["metadata"]["total_tables"] == 0
        assert schema["metadata"]["total_columns"] == 0

    def test_get_schema_default_schema_public(self):
        """Test that get_schema uses PUBLIC as default_schema when db_schema is not set."""
        source = SnowflakeSource(name="test_snowflake", database="TEST_DB", type="snowflake")

        columns_rows = [("PUBLIC", "TEST_TABLE", "COL1", "VARCHAR", "YES", None, None, None, 50)]

        mock_conn = self.create_mock_connection(columns_rows)

        with patch.object(SnowflakeSource, "get_connection", return_value=mock_conn):
            schema = source.get_schema()

        assert schema["metadata"]["default_schema"] == "PUBLIC"

    def test_get_schema_type_mapping(self):
        """Test that various Snowflake data types are correctly mapped."""
        source = SnowflakeSource(
            name="test_snowflake", database="TEST_DB", db_schema="TEST_SCHEMA", type="snowflake"
        )

        # Test various Snowflake data types
        columns_rows = [
            ("TEST_SCHEMA", "TYPE_TEST", "INT_COL", "NUMBER", "YES", None, 38, 0, None),
            ("TEST_SCHEMA", "TYPE_TEST", "DECIMAL_COL", "NUMBER", "YES", None, 10, 2, None),
            ("TEST_SCHEMA", "TYPE_TEST", "VARCHAR_COL", "VARCHAR", "YES", None, None, None, 255),
            ("TEST_SCHEMA", "TYPE_TEST", "TEXT_COL", "TEXT", "YES", None, None, None, None),
            ("TEST_SCHEMA", "TYPE_TEST", "BOOLEAN_COL", "BOOLEAN", "YES", None, None, None, None),
            ("TEST_SCHEMA", "TYPE_TEST", "DATE_COL", "DATE", "YES", None, None, None, None),
            (
                "TEST_SCHEMA",
                "TYPE_TEST",
                "TIMESTAMP_COL",
                "TIMESTAMP_NTZ",
                "YES",
                None,
                None,
                None,
                None,
            ),
            ("TEST_SCHEMA", "TYPE_TEST", "FLOAT_COL", "FLOAT", "YES", None, None, None, None),
        ]

        mock_conn = self.create_mock_connection(columns_rows)

        with patch.object(SnowflakeSource, "get_connection", return_value=mock_conn):
            schema = source.get_schema()

        columns = schema["tables"]["TEST_SCHEMA.TYPE_TEST"]["columns"]

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

    def test_get_schema_multi_schema(self):
        """Test that get_schema correctly handles tables from multiple schemas."""
        source = SnowflakeSource(
            name="test_snowflake", database="TEST_DB", db_schema="EDW", type="snowflake"
        )

        # Mock data with tables from multiple schemas
        columns_rows = [
            ("EDW", "FACT_ORDER", "COL1", "NUMBER", "NO", None, 38, 0, None),
            ("EDW", "DIM_USER", "USER_ID", "NUMBER", "NO", None, 38, 0, None),
            ("REPORTING", "GOALS", "GOAL_COL", "NUMBER", "YES", None, 10, 2, None),
        ]

        mock_conn = self.create_mock_connection(columns_rows)

        with patch.object(SnowflakeSource, "get_connection", return_value=mock_conn):
            schema = source.get_schema()

        # Verify tables from both schemas are included
        assert "EDW.FACT_ORDER" in schema["tables"]
        assert "EDW.DIM_USER" in schema["tables"]
        assert "REPORTING.GOALS" in schema["tables"]

        # Verify metadata
        assert schema["metadata"]["default_schema"] == "EDW"
        assert schema["metadata"]["total_tables"] == 3
