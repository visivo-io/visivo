"""
Tests for InsightQueryBuilder dialect-specific identifier handling.

This module tests that SQL queries generated for different dialects have
correct identifier quoting and case handling:
- Snowflake: UPPERCASE quoted identifiers
- PostgreSQL: lowercase quoted identifiers
- BigQuery: backtick-quoted identifiers (case preserved)
- MySQL: backtick-quoted identifiers (case preserved)
- DuckDB: double-quoted identifiers (case preserved)
"""

import pytest
from sqlglot import exp
from visivo.query.sqlglot_utils import normalize_identifier_for_dialect


class TestSnowflakeIdentifierQuoting:
    """Tests for Snowflake-specific identifier case handling.

    Snowflake stores unquoted identifiers as UPPERCASE. When we generate
    SQL with quoted identifiers, they must be uppercase to match.
    """

    def test_normalize_for_snowflake_uppercases(self):
        """Test that normalizing for Snowflake produces uppercase identifier."""
        result = normalize_identifier_for_dialect("my_hash", "snowflake", quoted=True)
        assert result.this == "MY_HASH"
        assert result.args.get("quoted") is True

    def test_snowflake_identifier_sql_generation(self):
        """Test that Snowflake identifier generates correct SQL string."""
        identifier = normalize_identifier_for_dialect("model_abc", "snowflake")
        sql = identifier.sql(dialect="snowflake")
        assert sql == '"MODEL_ABC"'

    def test_snowflake_table_reference_uppercase(self):
        """Test that table references for Snowflake are uppercase."""
        identifier = normalize_identifier_for_dialect("mwzyeppkbehppwkakfujyloyjgsha", "snowflake")
        # The hash should be uppercased for Snowflake
        assert identifier.this == "MWZYEPPKBEHPPWKAKFUJYLOYJGSHA"

    def test_snowflake_column_alias_uppercase(self):
        """Test that column aliases for Snowflake are uppercase."""
        # This simulates what happens with field resolver aliases
        identifier = normalize_identifier_for_dialect("mhkxejuqfzwbqgm", "snowflake")
        assert identifier.this == "MHKXEJUQFZWBQGM"


class TestMySQLIdentifierQuoting:
    """Tests for MySQL backtick quoting.

    MySQL uses backticks for identifier quoting and is generally case-insensitive.
    """

    def test_normalize_for_mysql_preserves_case(self):
        """Test that normalizing for MySQL preserves case."""
        result = normalize_identifier_for_dialect("MyColumn", "mysql", quoted=True)
        assert result.this == "MyColumn"
        assert result.args.get("quoted") is True

    def test_mysql_identifier_uses_backticks(self):
        """Test that MySQL identifier generates backticks in SQL."""
        identifier = normalize_identifier_for_dialect("my_column", "mysql")
        sql = identifier.sql(dialect="mysql")
        assert sql == "`my_column`"

    def test_mysql_table_reference(self):
        """Test that table references for MySQL use backticks."""
        identifier = normalize_identifier_for_dialect("mwzyeppkbehppwkakfujyloyjgsha", "mysql")
        sql = identifier.sql(dialect="mysql")
        assert sql == "`mwzyeppkbehppwkakfujyloyjgsha`"


class TestPostgreSQLIdentifierQuoting:
    """Tests for PostgreSQL lowercase handling.

    PostgreSQL stores unquoted identifiers as lowercase. When we generate
    SQL with quoted identifiers, they should be lowercase to match.
    """

    def test_normalize_for_postgres_lowercases(self):
        """Test that normalizing for PostgreSQL produces lowercase identifier."""
        result = normalize_identifier_for_dialect("MY_HASH", "postgresql", quoted=True)
        assert result.this == "my_hash"
        assert result.args.get("quoted") is True

    def test_postgres_identifier_sql_generation(self):
        """Test that PostgreSQL identifier generates correct SQL string."""
        identifier = normalize_identifier_for_dialect("MODEL_ABC", "postgresql")
        sql = identifier.sql(dialect="postgres")
        assert sql == '"model_abc"'

    def test_postgres_mixed_case_lowercased(self):
        """Test that mixed case is lowercased for PostgreSQL."""
        identifier = normalize_identifier_for_dialect("MyMixedCaseHash", "postgresql")
        assert identifier.this == "mymixedcasehash"


class TestBigQueryIdentifierQuoting:
    """Tests for BigQuery backtick handling.

    BigQuery uses backticks for identifier quoting and preserves case.
    """

    def test_normalize_for_bigquery_preserves_case(self):
        """Test that normalizing for BigQuery preserves case."""
        result = normalize_identifier_for_dialect("MyColumn", "bigquery", quoted=True)
        assert result.this == "MyColumn"
        assert result.args.get("quoted") is True

    def test_bigquery_identifier_uses_backticks(self):
        """Test that BigQuery identifier generates backticks in SQL."""
        identifier = normalize_identifier_for_dialect("my_column", "bigquery")
        sql = identifier.sql(dialect="bigquery")
        assert sql == "`my_column`"

    def test_bigquery_table_reference(self):
        """Test that table references for BigQuery use backticks."""
        identifier = normalize_identifier_for_dialect("mwzyeppkbehppwkakfujyloyjgsha", "bigquery")
        sql = identifier.sql(dialect="bigquery")
        assert sql == "`mwzyeppkbehppwkakfujyloyjgsha`"


class TestDuckDBIdentifierQuoting:
    """Tests for DuckDB double-quote handling.

    DuckDB uses double quotes for identifier quoting and preserves case.
    """

    def test_normalize_for_duckdb_preserves_case(self):
        """Test that normalizing for DuckDB preserves case."""
        result = normalize_identifier_for_dialect("MyColumn", "duckdb", quoted=True)
        assert result.this == "MyColumn"
        assert result.args.get("quoted") is True

    def test_duckdb_identifier_uses_double_quotes(self):
        """Test that DuckDB identifier generates double quotes in SQL."""
        identifier = normalize_identifier_for_dialect("my_column", "duckdb")
        sql = identifier.sql(dialect="duckdb")
        assert sql == '"my_column"'

    def test_duckdb_table_reference(self):
        """Test that table references for DuckDB use double quotes."""
        identifier = normalize_identifier_for_dialect("mwzyeppkbehppwkakfujyloyjgsha", "duckdb")
        sql = identifier.sql(dialect="duckdb")
        assert sql == '"mwzyeppkbehppwkakfujyloyjgsha"'


class TestIdentifierConsistency:
    """Tests to ensure identifier consistency across query components.

    These tests verify that CTE aliases, FROM clauses, and column references
    all use consistent casing for each dialect.
    """

    def test_snowflake_all_uppercase(self):
        """Test that all Snowflake identifiers are consistently uppercase."""
        model_hash = "mwzyeppkbehppwkakfujyloyjgsha"
        column_alias = "mhkxejuqfzwbqgm"

        # Both should be uppercase for Snowflake
        cte_identifier = normalize_identifier_for_dialect(model_hash, "snowflake")
        column_identifier = normalize_identifier_for_dialect(column_alias, "snowflake")

        assert cte_identifier.this == model_hash.upper()
        assert column_identifier.this == column_alias.upper()

        # And both should generate uppercase quoted SQL
        assert cte_identifier.sql(dialect="snowflake") == f'"{model_hash.upper()}"'
        assert column_identifier.sql(dialect="snowflake") == f'"{column_alias.upper()}"'

    def test_postgres_all_lowercase(self):
        """Test that all PostgreSQL identifiers are consistently lowercase."""
        model_hash = "MWZYEPPKBEHPPWKAKFUJYLOYJGSHA"
        column_alias = "MHKXEJUQFZWBQGM"

        # Both should be lowercase for PostgreSQL
        cte_identifier = normalize_identifier_for_dialect(model_hash, "postgresql")
        column_identifier = normalize_identifier_for_dialect(column_alias, "postgresql")

        assert cte_identifier.this == model_hash.lower()
        assert column_identifier.this == column_alias.lower()

    def test_mysql_case_preserved(self):
        """Test that all MySQL identifiers preserve case consistently."""
        model_hash = "mwzyeppkbehppwkakfujyloyjgsha"
        column_alias = "mhkxejuqfzwbqgm"

        # Both should preserve case for MySQL
        cte_identifier = normalize_identifier_for_dialect(model_hash, "mysql")
        column_identifier = normalize_identifier_for_dialect(column_alias, "mysql")

        assert cte_identifier.this == model_hash
        assert column_identifier.this == column_alias

        # And both should use backticks
        assert cte_identifier.sql(dialect="mysql") == f"`{model_hash}`"
        assert column_identifier.sql(dialect="mysql") == f"`{column_alias}`"
