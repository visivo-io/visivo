"""
Tests for SqlglotQueryBuilder using real objects and factories.
"""

import pytest
from visivo.query.sqlglot_query_builder import SqlglotQueryBuilder
from visivo.models.tokenized_trace import TokenizedTrace
from visivo.models.project import Project
from tests.factories.model_factories import (
    SourceFactory,
    SqlModelFactory,
    ProjectFactory,
)


class TestSqlglotQueryBuilder:
    """Test suite for SqlglotQueryBuilder using real objects."""

    def test_simple_select_query(self):
        """Test building a simple SELECT query."""
        # Create real objects using factories
        source = SourceFactory(name="test_db")
        model = SqlModelFactory(
            name="orders",
            sql="SELECT id, customer_id, amount FROM orders_table",
            source="ref(test_db)",
        )

        project = ProjectFactory(
            name="test_project",
            sources=[source],
            models=[model],
            dashboards=[],  # Override default dashboard to avoid reference issues
        )

        # Create a tokenized trace with real data
        tokenized = TokenizedTrace(
            sql=model.sql,  # The model SQL to use as base
            cohort_on="",  # No cohort for this test
            source=source.name,
            source_type="sqlite",
            select_items={"id": "id", "customer_id": "customer_id", "amount": "amount"},
            filter_by={},
            order_by=[],
        )

        # Create builder
        builder = SqlglotQueryBuilder(tokenized, project)

        # Build query
        sql = builder.build()

        # Verify the generated SQL
        assert "WITH" in sql
        assert "orders" in sql
        assert "SELECT" in sql
        # Check that all columns are present (case-insensitive)
        sql_lower = sql.lower()
        assert "id" in sql_lower
        assert "customer_id" in sql_lower
        assert "amount" in sql_lower

    def test_query_with_aggregates(self):
        """Test building a query with aggregate functions."""
        # Create real project with factories
        source = SourceFactory(name="test_db")
        model = SqlModelFactory(
            name="orders",
            sql="SELECT id, customer_id, amount FROM orders_table",
            source="ref(test_db)",
        )

        project = ProjectFactory(
            name="test_project",
            sources=[source],
            models=[model],
            dashboards=[],  # Override default dashboard to avoid reference issues
        )

        # Create tokenized trace with aggregates
        tokenized = TokenizedTrace(
            sql=model.sql,  # The model SQL to use as base
            cohort_on="",  # No cohort for this test
            source=source.name,
            source_type="sqlite",
            select_items={
                "customer_id": "customer_id",
                "total_amount": "SUM(amount)",
                "order_count": "COUNT(*)",
            },
            filter_by={},
            order_by=["customer_id"],
        )

        # Build and verify
        builder = SqlglotQueryBuilder(tokenized, project)
        sql = builder.build()

        # Verify aggregates and GROUP BY
        assert "SUM(amount)" in sql
        assert "COUNT(*)" in sql
        assert "GROUP BY" in sql
        assert "ORDER BY" in sql

    def test_query_with_filters(self):
        """Test building a query with WHERE clause."""
        # Create real objects
        source = SourceFactory(name="test_db")
        model = SqlModelFactory(
            name="orders",
            sql="SELECT id, customer_id, amount FROM orders_table",
            source="ref(test_db)",
        )

        project = ProjectFactory(
            name="test_project",
            sources=[source],
            models=[model],
            dashboards=[],  # Override default dashboard to avoid reference issues
        )

        # Tokenized trace with filters
        tokenized = TokenizedTrace(
            sql=model.sql,  # The model SQL to use as base
            cohort_on="",  # No cohort for this test
            source=source.name,
            source_type="sqlite",
            select_items={"id": "id", "amount": "amount"},
            filter_by={"vanilla": ["amount > 100"]},
            order_by=[],
        )

        # Build and verify
        builder = SqlglotQueryBuilder(tokenized, project)
        sql = builder.build()

        # Verify WHERE clause
        assert "WHERE" in sql
        assert "amount > 100" in sql

    def test_query_with_order_by(self):
        """Test building a query with ORDER BY."""
        # Create real objects
        source = SourceFactory(name="test_db")
        model = SqlModelFactory(
            name="orders",
            sql="SELECT id, customer_id, amount FROM orders_table",
            source="ref(test_db)",
        )

        project = ProjectFactory(
            name="test_project",
            sources=[source],
            models=[model],
            dashboards=[],  # Override default dashboard to avoid reference issues
        )

        # Tokenized trace with order by
        tokenized = TokenizedTrace(
            sql=model.sql,  # The model SQL to use as base
            cohort_on="",  # No cohort for this test
            source=source.name,
            source_type="sqlite",
            select_items={"id": "id", "amount": "amount"},
            filter_by={},
            order_by=["amount DESC"],
        )

        # Build and verify
        builder = SqlglotQueryBuilder(tokenized, project)
        sql = builder.build()

        # Verify ORDER BY
        assert "ORDER BY" in sql
        assert "DESC" in sql

    def test_dialect_specific_sql_generation(self):
        """Test that SQL is generated correctly for different dialects."""
        # Test with PostgreSQL dialect
        source = SourceFactory(name="pg_db")
        model = SqlModelFactory(name="users", sql="SELECT * FROM users", source="ref(pg_db)")

        project = ProjectFactory(
            name="test_project",
            sources=[source],
            models=[model],
            dashboards=[],  # Override default dashboard to avoid reference issues
        )

        # Test different SQL dialects
        for dialect in ["postgresql", "mysql", "sqlite"]:
            tokenized = TokenizedTrace(
                sql=model.sql,  # The model SQL to use as base
                cohort_on="",  # No cohort for this test
                source=source.name,
                source_type=dialect,
                select_items={"id": "id", "created": "created_at"},
                filter_by={},
                order_by=[],
            )

            # Build for each dialect
            builder = SqlglotQueryBuilder(tokenized, project)
            sql = builder.build()

            # Basic verification - should generate valid SQL
            assert "WITH" in sql
            assert "SELECT" in sql
            assert model.name in sql

    def test_complex_query_with_multiple_features(self):
        """Test a complex query combining multiple features."""
        # Create real project
        source = SourceFactory(name="analytics_db")
        model = SqlModelFactory(
            name="events",
            sql="SELECT event_id, user_id, event_type, timestamp, value FROM events",
            source="ref(analytics_db)",
        )

        project = ProjectFactory(
            name="analytics_project",
            sources=[source],
            models=[model],
            dashboards=[],  # Override default dashboard to avoid reference issues
        )

        # Complex tokenized trace
        tokenized = TokenizedTrace(
            sql=model.sql,  # The model SQL to use as base
            cohort_on="",  # No cohort for this test
            source=source.name,
            source_type="postgresql",
            select_items={
                "event_type": "event_type",
                "user_count": "COUNT(DISTINCT user_id)",
                "total_value": "SUM(value)",
                "avg_value": "AVG(value)",
            },
            filter_by={"vanilla": ["timestamp > '2024-01-01'", "value > 0"]},
            order_by=["total_value DESC", "event_type"],
        )

        # Build complex query
        builder = SqlglotQueryBuilder(tokenized, project)
        sql = builder.build()

        # Verify all features are present
        assert "WITH" in sql
        assert "COUNT(DISTINCT user_id)" in sql
        assert "SUM(value)" in sql
        assert "AVG(value)" in sql
        assert "WHERE" in sql
        assert "timestamp > '2024-01-01'" in sql
        assert "value > 0" in sql
        assert "GROUP BY" in sql
        assert "ORDER BY" in sql

    def test_edge_cases(self):
        """Test edge cases and error handling."""
        # Test with empty select items
        source = SourceFactory(name="test_db")
        model = SqlModelFactory(name="test", sql="SELECT * FROM test_table", source="ref(test_db)")

        project = ProjectFactory(
            name="test_project", sources=[source], models=[model], dashboards=[]
        )

        # Empty select items
        tokenized = TokenizedTrace(
            sql=model.sql,
            cohort_on="",
            source=source.name,
            source_type="sqlite",
            select_items={},
            filter_by={},
            order_by=[],
        )

        builder = SqlglotQueryBuilder(tokenized, project)
        sql = builder.build()

        # Should still generate valid SQL with CTE
        assert "WITH base_model AS" in sql

    def test_invalid_sql_handling(self):
        """Test handling of invalid SQL in expressions."""
        source = SourceFactory(name="test_db")
        model = SqlModelFactory(name="test", sql="SELECT * FROM test_table", source="ref(test_db)")

        project = ProjectFactory(
            name="test_project", sources=[source], models=[model], dashboards=[]
        )

        # Test with unparseable expression (but still valid as column name)
        tokenized = TokenizedTrace(
            sql=model.sql,
            cohort_on="",
            source=source.name,
            source_type="sqlite",
            select_items={
                "col1": "column_name",  # Simple column reference
                "col2": "$$invalid$$",  # Invalid SQL but valid column name
            },
            filter_by={},
            order_by=[],
        )

        builder = SqlglotQueryBuilder(tokenized, project)
        sql = builder.build()

        # Should still generate SQL even with invalid expressions
        assert "WITH base_model AS" in sql
        assert "SELECT" in sql

    def test_complex_aggregate_expressions(self):
        """Test complex aggregate expressions including window functions."""
        source = SourceFactory(name="test_db")
        model = SqlModelFactory(
            name="sales",
            sql="SELECT date, product_id, revenue FROM sales_table",
            source="ref(test_db)",
        )

        project = ProjectFactory(
            name="test_project", sources=[source], models=[model], dashboards=[]
        )

        # Test with various aggregate types
        tokenized = TokenizedTrace(
            sql=model.sql,
            cohort_on="",
            source=source.name,
            source_type="postgresql",
            select_items={
                "product_id": "product_id",
                "total_revenue": "SUM(revenue)",
                "max_revenue": "MAX(revenue)",
                "min_revenue": "MIN(revenue)",
                "count_sales": "COUNT(*)",
                "distinct_products": "COUNT(DISTINCT product_id)",
                "avg_revenue": "AVG(revenue)",
                # Complex expression with math
                "revenue_percentage": "SUM(revenue) * 100.0 / SUM(SUM(revenue)) OVER ()",
            },
            filter_by={},
            order_by=["total_revenue DESC"],
        )

        builder = SqlglotQueryBuilder(tokenized, project)
        sql = builder.build()

        # Verify all aggregates are present
        assert "SUM(revenue)" in sql
        assert "MAX(revenue)" in sql
        assert "MIN(revenue)" in sql
        assert "AVG(revenue)" in sql
        assert "COUNT(*)" in sql
        assert "COUNT(DISTINCT product_id)" in sql
        assert "GROUP BY" in sql  # Should group by product_id
        assert "product_id" in sql.split("GROUP BY")[1]  # product_id should be in GROUP BY
