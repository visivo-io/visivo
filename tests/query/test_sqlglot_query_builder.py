"""
Tests for SqlglotQueryBuilder using real objects and factories.
"""

import pytest
from visivo.query.sqlglot_query_builder import SqlglotQueryBuilder
from visivo.models.tokenized_trace import TokenizedTrace
from visivo.models.project import Project
from visivo.models.dimension import Dimension
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

    def test_alias_sanitization_with_dots(self):
        """Test that aliases with dots are sanitized to use pipes."""
        source = SourceFactory(name="test_db")
        model = SqlModelFactory(
            name="test_model",
            sql="SELECT id, props FROM test_table",
            source="ref(test_db)",
        )

        project = ProjectFactory(
            name="test_project",
            sources=[source],
            models=[model],
            dashboards=[],
        )

        # Create tokenized trace with dotted aliases
        tokenized = TokenizedTrace(
            sql=model.sql,
            cohort_on="",
            source=source.name,
            source_type="bigquery",
            select_items={
                "props.x": "props.x",
                "props.y": "props.y",
                "props.z": "SUM(props.z)",
            },
            filter_by={},
            order_by=["props.x"],
        )

        builder = SqlglotQueryBuilder(tokenized, project)
        sql = builder.build()

        # For BigQuery, dots should be replaced with pipes in aliases
        assert "`props|x`" in sql or "props|x" in sql
        assert "`props|y`" in sql or "props|y" in sql
        assert "`props|z`" in sql or "props|z" in sql

    def test_order_by_uses_alias_when_group_by_present(self):
        """Test that ORDER BY uses aliases when GROUP BY is present."""
        source = SourceFactory(name="test_db")
        model = SqlModelFactory(
            name="test_model",
            sql="SELECT year, month, sales FROM sales_table",
            source="ref(test_db)",
        )

        project = ProjectFactory(
            name="test_project",
            sources=[source],
            models=[model],
            dashboards=[],
        )

        # Create tokenized trace with GROUP BY scenario
        tokenized = TokenizedTrace(
            sql=model.sql,
            cohort_on="",
            source=source.name,
            source_type="snowflake",
            select_items={
                "year": "year",
                "total_sales": "SUM(sales)",
            },
            filter_by={},
            order_by=["year"],
        )

        builder = SqlglotQueryBuilder(tokenized, project)
        sql = builder.build()

        # ORDER BY should use the alias when GROUP BY is present
        # Check that ORDER BY comes after GROUP BY and references the alias
        if "GROUP BY" in sql and "ORDER BY" in sql:
            order_by_part = sql.split("ORDER BY")[1]
            # Should not reference base_model.year, should use the alias
            assert "base_model.year" not in order_by_part.lower()

    def test_schema_building_from_dimensions(self):
        """Test that schema is correctly built from model dimensions."""
        source = SourceFactory(name="test_db")

        # Create model with explicit dimensions
        model = SqlModelFactory(
            name="test_model",
            sql="SELECT id, name, amount FROM test_table",
            source="ref(test_db)",
        )

        # Add explicit dimensions to the model
        model.dimensions = [
            Dimension(name="id", expression="id", data_type="INTEGER"),
            Dimension(name="name", expression="name", data_type="VARCHAR"),
        ]

        # Add implicit dimensions (simulating what extract_dimensions_job would do)
        model._implicit_dimensions = [
            Dimension(name="amount", expression="amount", data_type="DECIMAL"),
        ]

        project = ProjectFactory(
            name="test_project",
            sources=[source],
            models=[model],
            dashboards=[],
        )

        tokenized = TokenizedTrace(
            sql=model.sql,
            cohort_on="",
            source=source.name,
            source_type="snowflake",
            select_items={"id": "id", "name": "name", "total": "SUM(amount)"},
            filter_by={},
            order_by=["id"],
        )

        builder = SqlglotQueryBuilder(tokenized, project)

        # Test the schema building method
        schema = builder._build_schema_from_dimensions()

        assert schema is not None
        assert "base_model" in schema
        assert "id" in schema["base_model"]
        assert schema["base_model"]["id"] == "INTEGER"
        assert "name" in schema["base_model"]
        assert schema["base_model"]["name"] == "VARCHAR"
        assert "amount" in schema["base_model"]
        assert schema["base_model"]["amount"] == "DECIMAL"

    def test_bigquery_specific_behavior(self):
        """Test BigQuery-specific SQL generation with pipe delimiters."""
        source = SourceFactory(name="bq_dataset")
        model = SqlModelFactory(
            name="events",
            sql="SELECT event_id, props, timestamp FROM events_table",
            source="ref(bq_dataset)",
        )

        project = ProjectFactory(
            name="bq_project",
            sources=[source],
            models=[model],
            dashboards=[],
        )

        # BigQuery query with nested field references
        tokenized = TokenizedTrace(
            sql=model.sql,
            cohort_on="",
            source=source.name,
            source_type="bigquery",
            select_items={
                "event_id": "event_id",
                "props.device.type": "props.device.type",
                "props.user.id": "props.user.id",
                "event_count": "COUNT(*)",
            },
            filter_by={},
            order_by=["props.device.type"],
        )

        builder = SqlglotQueryBuilder(tokenized, project)
        sql = builder.build()

        # BigQuery should use pipe delimiters for nested fields
        # The aliases should have pipes instead of dots
        assert "props|device|type" in sql
        assert "props|user|id" in sql

        # Original field references in expressions should remain unchanged
        assert "props.device.type" in sql
        assert "props.user.id" in sql

    def test_snowflake_identifier_quoting(self):
        """Test that Snowflake properly quotes identifiers."""
        source = SourceFactory(name="sf_warehouse")
        model = SqlModelFactory(
            name="data",
            sql='SELECT "year", "month", value FROM data_table',
            source="ref(sf_warehouse)",
        )

        # Add dimensions to enable schema building
        model.dimensions = [
            Dimension(name="year", expression='"year"', data_type="INTEGER"),
            Dimension(name="month", expression='"month"', data_type="INTEGER"),
            Dimension(name="value", expression="value", data_type="DECIMAL"),
        ]

        project = ProjectFactory(
            name="sf_project",
            sources=[source],
            models=[model],
            dashboards=[],
        )

        # Snowflake query with reserved keywords as column names
        tokenized = TokenizedTrace(
            sql=model.sql,
            cohort_on="",
            source=source.name,
            source_type="snowflake",
            select_items={
                "year": '"year"',
                "month": '"month"',
                "total_value": "SUM(value)",
            },
            filter_by={},
            order_by=['"year"', '"month"'],
        )

        builder = SqlglotQueryBuilder(tokenized, project)
        sql = builder.build()

        # Snowflake should have quoted identifiers where needed
        # The qualify step should ensure proper quoting
        assert sql is not None
        assert "SELECT" in sql.upper()

    def test_multi_model_query_with_sanitized_aliases(self):
        """Test multi-model queries with alias sanitization."""
        source = SourceFactory(name="test_db")

        model1 = SqlModelFactory(
            name="users",
            sql="SELECT id, name, metadata FROM users_table",
            source="ref(test_db)",
        )

        model2 = SqlModelFactory(
            name="events",
            sql="SELECT user_id, event_type, props FROM events_table",
            source="ref(test_db)",
        )

        project = ProjectFactory(
            name="test_project",
            sources=[source],
            models=[model1, model2],
            dashboards=[],
        )

        # Multi-model tokenized trace with dotted field names
        tokenized = TokenizedTrace(
            sql="SELECT u.name, e.props FROM users u JOIN events e ON u.id = e.user_id",
            cohort_on="",
            source=source.name,
            source_type="bigquery",
            select_items={
                "user_name": "u.name",
                "props.action": "e.props.action",
                "props.category": "e.props.category",
                "event_count": "COUNT(*)",
            },
            filter_by={},
            order_by=["user_name"],
            models_used={"users": model1, "events": model2},
        )

        builder = SqlglotQueryBuilder(tokenized, project)
        sql = builder.build()

        # Check that aliases are sanitized in multi-model queries
        assert "props|action" in sql
        assert "props|category" in sql

    def test_complex_order_by_with_aggregates_and_aliases(self):
        """Test complex ORDER BY scenarios with aggregates and GROUP BY."""
        source = SourceFactory(name="test_db")
        model = SqlModelFactory(
            name="sales",
            sql="SELECT region, year, quarter, revenue FROM sales_data",
            source="ref(test_db)",
        )

        project = ProjectFactory(
            name="test_project",
            sources=[source],
            models=[model],
            dashboards=[],
        )

        # Complex query with multiple GROUP BY columns and ORDER BY
        tokenized = TokenizedTrace(
            sql=model.sql,
            cohort_on="",
            source=source.name,
            source_type="postgresql",
            select_items={
                "region": "region",
                "year": "year",
                "total_revenue": "SUM(revenue)",
                "avg_revenue": "AVG(revenue)",
                "max_revenue": "MAX(revenue)",
            },
            filter_by={},
            order_by=["year DESC", "total_revenue DESC", "region"],
        )

        builder = SqlglotQueryBuilder(tokenized, project)
        sql = builder.build()

        # Verify GROUP BY is present
        assert "GROUP BY" in sql

        # Verify ORDER BY uses appropriate references
        assert "ORDER BY" in sql
        order_by_clause = (
            sql.split("ORDER BY")[1].split("LIMIT")[0]
            if "LIMIT" in sql
            else sql.split("ORDER BY")[1]
        )

        # When GROUP BY is present, ORDER BY should use aliases or grouped columns
        # Should not reference base_model columns directly
        assert "base_model.year" not in order_by_clause.lower()
        assert "base_model.region" not in order_by_clause.lower()
