"""
Tests for Snowflake-specific SQL generation.
"""

import pytest
from visivo.query.sqlglot_query_builder import SqlglotQueryBuilder
from visivo.models.tokenized_trace import TokenizedTrace
from visivo.models.sources.snowflake_source import SnowflakeSource
from visivo.models.project import Project


class TestSnowflakeDialect:
    """Test Snowflake-specific SQL generation."""

    def test_snowflake_simple_query(self):
        """Test basic Snowflake SQL generation."""
        # Create a Snowflake source
        source = SnowflakeSource(
            name="snowflake_test",
            type="snowflake",
            database="test_db",
            db_schema="test_schema",
            warehouse="test_warehouse",
            role="test_role",
        )

        project = Project(name="snowflake_project", sources=[source])

        # Create a tokenized trace
        tokenized = TokenizedTrace(
            sql="SELECT * FROM sales_data",
            cohort_on="'Q4_2024'",
            source="snowflake_test",
            source_type="snowflake",
            columns=["id", "amount", "region"],
            select_items={"region": "region", "total": "SUM(amount)"},
        )

        # Build the query
        builder = SqlglotQueryBuilder(tokenized_trace=tokenized, project=project)
        sql = builder.build()

        print(f"Generated Snowflake SQL:\n{sql}")

        # Verify the SQL is valid and contains expected elements
        assert "WITH" in sql.upper()
        assert "base_model" in sql
        assert "SELECT" in sql.upper()
        assert 'AS "cohort_on"' in sql
        assert "GROUP BY" in sql.upper()

    def test_snowflake_with_aggregates(self):
        """Test Snowflake SQL with various aggregate functions."""
        source = SnowflakeSource(
            name="snowflake_test",
            type="snowflake",
            database="test_db",
            db_schema="test_schema",
            warehouse="test_warehouse",
            role="test_role",
        )

        project = Project(name="snowflake_project", sources=[source])

        tokenized = TokenizedTrace(
            sql="SELECT * FROM transactions",
            cohort_on="date_trunc('month', transaction_date)",
            source="snowflake_test",
            source_type="snowflake",
            columns=["transaction_date", "amount", "customer_id"],
            select_items={
                "month": "date_trunc('month', transaction_date)",
                "total_amount": "SUM(amount)",
                "avg_amount": "AVG(amount)",
                "customer_count": "COUNT(DISTINCT customer_id)",
                "transaction_count": "COUNT(*)",
            },
            filter_by={
                "vanilla": ["transaction_date >= '2024-01-01'"],
                "aggregate": ["SUM(amount) > 1000"],
            },
        )

        builder = SqlglotQueryBuilder(tokenized_trace=tokenized, project=project)
        sql = builder.build()

        print(f"Generated Snowflake SQL with aggregates:\n{sql}")

        # Check for Snowflake-specific functions and syntax
        assert "date_trunc" in sql.lower() or "DATE_TRUNC" in sql
        assert "COUNT(DISTINCT" in sql.upper()
        assert "WHERE" in sql.upper()
        assert "HAVING" in sql.upper()

    def test_snowflake_with_window_functions(self):
        """Test Snowflake SQL with window functions."""
        source = SnowflakeSource(
            name="snowflake_test",
            type="snowflake",
            database="test_db",
            db_schema="test_schema",
            warehouse="test_warehouse",
            role="test_role",
        )

        project = Project(name="snowflake_project", sources=[source])

        tokenized = TokenizedTrace(
            sql="SELECT * FROM sales",
            cohort_on="'2024'",
            source="snowflake_test",
            source_type="snowflake",
            columns=["date", "amount", "product"],
            select_items={
                "date": "date",
                "product": "product",
                "amount": "amount",
                "running_total": "SUM(amount) OVER (PARTITION BY product ORDER BY date)",
                "rank": "RANK() OVER (PARTITION BY product ORDER BY amount DESC)",
            },
        )

        builder = SqlglotQueryBuilder(tokenized_trace=tokenized, project=project)
        sql = builder.build()

        print(f"Generated Snowflake SQL with window functions:\n{sql}")

        # Verify window functions are preserved
        assert "OVER" in sql.upper()
        assert "PARTITION BY" in sql.upper()
        assert "ORDER BY" in sql.upper()
        assert "RANK()" in sql.upper()

        # Should NOT have GROUP BY since we're using window functions
        assert "GROUP BY" not in sql.upper()
