"""
Tests for visivo.query.sql_table_extractor module.

Tests SQL table extraction from queries using SQLGlot AST.
"""

import pytest
from visivo.query.sql_table_extractor import (
    extract_table_references,
    extract_qualified_table_references,
    extract_schema_references,
)


class TestExtractTableReferences:
    """Tests for the extract_table_references function."""

    def test_simple_select(self):
        """Test extracting table from simple SELECT."""
        tables = extract_table_references("SELECT * FROM users", "duckdb")
        assert tables == {"users"}

    def test_multiple_tables_join(self):
        """Test extracting tables from JOIN query."""
        sql = "SELECT * FROM orders o JOIN customers c ON o.customer_id = c.id"
        tables = extract_table_references(sql, "duckdb")
        assert tables == {"orders", "customers"}

    def test_multiple_joins(self):
        """Test extracting tables from multiple JOINs."""
        sql = """
        SELECT o.id, c.name, p.product_name
        FROM orders o
        JOIN customers c ON o.customer_id = c.id
        LEFT JOIN products p ON o.product_id = p.id
        """
        tables = extract_table_references(sql, "duckdb")
        assert tables == {"orders", "customers", "products"}

    def test_cte_excluded(self):
        """Test that CTE names are excluded from table references."""
        sql = """
        WITH temp_orders AS (
            SELECT * FROM orders WHERE status = 'active'
        )
        SELECT * FROM temp_orders JOIN customers ON 1=1
        """
        tables = extract_table_references(sql, "duckdb")
        # CTE 'temp_orders' should be excluded, only base tables returned
        assert tables == {"orders", "customers"}

    def test_multiple_ctes_excluded(self):
        """Test multiple CTEs are excluded."""
        sql = """
        WITH
            cte1 AS (SELECT * FROM base_table),
            cte2 AS (SELECT * FROM cte1),
            cte3 AS (SELECT * FROM cte1 JOIN cte2 ON 1=1)
        SELECT * FROM cte3 JOIN another_table ON 1=1
        """
        tables = extract_table_references(sql, "duckdb")
        assert tables == {"base_table", "another_table"}

    def test_subquery_tables(self):
        """Test extracting tables from subqueries."""
        sql = """
        SELECT * FROM orders
        WHERE customer_id IN (SELECT id FROM customers WHERE region = 'US')
        """
        tables = extract_table_references(sql, "duckdb")
        assert tables == {"orders", "customers"}

    def test_qualified_table_stripped(self):
        """Test that schema-qualified tables return just table name."""
        sql = "SELECT * FROM schema1.users"
        tables = extract_table_references(sql, "duckdb")
        assert tables == {"users"}

    def test_empty_sql_returns_empty_set(self):
        """Test empty SQL returns empty set."""
        tables = extract_table_references("", "duckdb")
        assert tables == set()

    def test_invalid_sql_returns_empty_set(self):
        """Test invalid SQL returns empty set without raising."""
        tables = extract_table_references("SELECT * FROM (invalid syntax", "duckdb")
        assert tables == set()

    def test_union_query(self):
        """Test extracting tables from UNION query."""
        sql = """
        SELECT id, name FROM users
        UNION ALL
        SELECT id, name FROM admins
        """
        tables = extract_table_references(sql, "duckdb")
        assert tables == {"users", "admins"}

    def test_snowflake_dialect(self):
        """Test extraction works with Snowflake dialect."""
        sql = "SELECT * FROM EDW.FACT_ORDERS JOIN REPORTING.DIM_CUSTOMERS ON 1=1"
        tables = extract_table_references(sql, "snowflake")
        assert tables == {"FACT_ORDERS", "DIM_CUSTOMERS"}


class TestExtractQualifiedTableReferences:
    """Tests for the extract_qualified_table_references function."""

    def test_unqualified_table(self):
        """Test unqualified table returns just table name."""
        tables = extract_qualified_table_references("SELECT * FROM users", "duckdb")
        assert tables == {"users"}

    def test_schema_qualified_table(self):
        """Test schema-qualified table returns schema.table."""
        sql = "SELECT * FROM REPORTING.goals"
        tables = extract_qualified_table_references(sql, "snowflake")
        assert tables == {"REPORTING.goals"}

    def test_mixed_qualified_unqualified(self):
        """Test mix of qualified and unqualified tables."""
        sql = "SELECT * FROM orders JOIN REPORTING.goals ON 1=1"
        tables = extract_qualified_table_references(sql, "snowflake")
        assert tables == {"orders", "REPORTING.goals"}

    def test_cte_excluded_with_qualified(self):
        """Test CTEs excluded even with qualified tables."""
        sql = """
        WITH temp AS (SELECT * FROM base_table)
        SELECT * FROM temp JOIN REPORTING.metrics ON 1=1
        """
        tables = extract_qualified_table_references(sql, "snowflake")
        assert tables == {"base_table", "REPORTING.metrics"}


class TestExtractSchemaReferences:
    """Tests for the extract_schema_references function."""

    def test_no_schema_returns_empty(self):
        """Test unqualified tables return no schemas."""
        schemas = extract_schema_references("SELECT * FROM users", "duckdb")
        assert schemas == set()

    def test_single_schema(self):
        """Test single schema reference."""
        sql = "SELECT * FROM REPORTING.goals"
        schemas = extract_schema_references(sql, "snowflake")
        assert schemas == {"REPORTING"}

    def test_multiple_schemas(self):
        """Test multiple schema references."""
        sql = """
        SELECT * FROM EDW.fact_orders
        JOIN REPORTING.dim_customers ON 1=1
        JOIN ANALYTICS.metrics ON 1=1
        """
        schemas = extract_schema_references(sql, "snowflake")
        assert schemas == {"EDW", "REPORTING", "ANALYTICS"}

    def test_mixed_qualified_unqualified(self):
        """Test only qualified tables contribute schemas."""
        sql = "SELECT * FROM orders JOIN REPORTING.goals ON 1=1"
        schemas = extract_schema_references(sql, "snowflake")
        assert schemas == {"REPORTING"}

    def test_duplicate_schema_deduped(self):
        """Test duplicate schema references are deduplicated."""
        sql = """
        SELECT * FROM REPORTING.goals
        JOIN REPORTING.metrics ON 1=1
        """
        schemas = extract_schema_references(sql, "snowflake")
        assert schemas == {"REPORTING"}
