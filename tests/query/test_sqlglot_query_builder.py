"""
Tests for SqlglotQueryBuilder using real objects and factories.
"""

import pytest
from visivo.query.sqlglot_query_builder import SqlglotQueryBuilder
from visivo.models.tokenized_trace import TokenizedTrace
from visivo.models.dimension import Dimension
from tests.factories.model_factories import (
    SourceFactory,
    SqlModelFactory,
    ProjectFactory,
)


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def basic_source():
    """Create a basic source for testing."""
    return SourceFactory(name="test_db")


@pytest.fixture
def basic_model(basic_source):
    """Create a basic SQL model for testing."""
    return SqlModelFactory(
        name="orders",
        sql="SELECT id, customer_id, amount FROM orders_table",
        source="ref(test_db)",
    )


@pytest.fixture
def basic_project(basic_source, basic_model):
    """Create a basic project with source and model."""
    return ProjectFactory(
        name="test_project",
        sources=[basic_source],
        models=[basic_model],
        dashboards=[],  # Override default dashboard to avoid reference issues
    )


@pytest.fixture
def query_builder_factory(basic_project):
    """Factory fixture to create QueryBuilder instances with tokenized trace."""

    def _create_builder(
        sql=None,
        source_name="test_db",
        source_type="sqlite",
        select_items=None,
        filter_by=None,
        order_by=None,
        cohort_on="",
        models_used=None,
    ):
        # Use the SQL from the basic model if not provided
        if sql is None:
            sql = basic_project.models[0].sql

        tokenized = TokenizedTrace(
            sql=sql,
            cohort_on=cohort_on,
            source=source_name,
            source_type=source_type,
            select_items=select_items or {},
            filter_by=filter_by or {},
            order_by=order_by or [],
            models_used=models_used or {},
        )
        return SqlglotQueryBuilder(tokenized, basic_project)

    return _create_builder


# ============================================================================
# Helper Functions
# ============================================================================


def assert_sql_contains(sql, *expected_parts, case_sensitive=False):
    """Helper to assert that SQL contains expected parts."""
    if not case_sensitive:
        sql = sql.lower()
        expected_parts = [part.lower() for part in expected_parts]

    for part in expected_parts:
        assert part in sql, f"Expected '{part}' not found in SQL:\n{sql}"


def assert_sql_contains_in_order(sql, *expected_parts):
    """Helper to assert that SQL contains expected parts in order."""
    sql_lower = sql.lower()
    last_index = -1

    for part in expected_parts:
        part_lower = part.lower()
        index = sql_lower.find(part_lower, last_index + 1)
        assert index > last_index, f"'{part}' not found after previous parts in SQL:\n{sql}"
        last_index = index


# ============================================================================
# Test Basic Queries
# ============================================================================


class TestBasicQueries:
    """Tests for basic SQL query generation."""

    @pytest.mark.parametrize(
        "select_items,expected_columns",
        [
            (
                {"id": "id", "customer_id": "customer_id", "amount": "amount"},
                ["id", "customer_id", "amount"],
            ),
            ({"id": "id", "amount": "amount"}, ["id", "amount"]),
            ({"total": "amount * 2"}, ["amount * 2"]),
        ],
    )
    def test_simple_select_queries(self, query_builder_factory, select_items, expected_columns):
        """Test building simple SELECT queries with different column selections."""
        builder = query_builder_factory(select_items=select_items)
        sql = builder.build()

        assert_sql_contains(sql, "WITH", "orders", "SELECT")
        for column in expected_columns:
            assert_sql_contains(sql, column)

    def test_empty_select_items(self, query_builder_factory):
        """Test query with empty select items."""
        builder = query_builder_factory(select_items={})
        sql = builder.build()

        # Should still generate valid SQL with CTE
        assert_sql_contains(sql, "WITH base_model AS")


# ============================================================================
# Test Aggregations
# ============================================================================


class TestAggregations:
    """Tests for queries with aggregate functions."""

    @pytest.mark.parametrize(
        "select_items,expected_aggregates,should_have_group_by",
        [
            (
                {
                    "customer_id": "customer_id",
                    "total_amount": "SUM(amount)",
                    "order_count": "COUNT(*)",
                },
                ["SUM(amount)", "COUNT(*)"],
                True,
            ),
            (
                {
                    "total": "SUM(amount)",
                    "average": "AVG(amount)",
                    "maximum": "MAX(amount)",
                    "minimum": "MIN(amount)",
                },
                ["SUM(amount)", "AVG(amount)", "MAX(amount)", "MIN(amount)"],
                False,  # No non-aggregate columns
            ),
            (
                {
                    "product_id": "product_id",
                    "distinct_customers": "COUNT(DISTINCT customer_id)",
                },
                ["COUNT(DISTINCT customer_id)"],
                True,
            ),
        ],
    )
    def test_aggregate_queries(
        self, query_builder_factory, select_items, expected_aggregates, should_have_group_by
    ):
        """Test queries with various aggregate functions."""
        builder = query_builder_factory(select_items=select_items)
        sql = builder.build()

        for aggregate in expected_aggregates:
            assert_sql_contains(sql, aggregate, case_sensitive=True)

        if should_have_group_by:
            assert_sql_contains(sql, "GROUP BY")

    def test_complex_aggregate_with_window_function(self, query_builder_factory):
        """Test complex aggregate expressions including window functions."""
        select_items = {
            "product_id": "product_id",
            "total_revenue": "SUM(amount)",
            "revenue_percentage": "SUM(amount) * 100.0 / SUM(SUM(amount)) OVER ()",
        }

        builder = query_builder_factory(select_items=select_items)
        sql = builder.build()

        assert_sql_contains(sql, "SUM(amount)", "GROUP BY", "OVER ()", case_sensitive=True)


# ============================================================================
# Test Filters and Conditions
# ============================================================================


class TestFiltersAndConditions:
    """Tests for WHERE clause and filtering."""

    @pytest.mark.parametrize(
        "filter_by,expected_conditions",
        [
            ({"vanilla": ["amount > 100"]}, ["WHERE", "amount > 100"]),
            (
                {"vanilla": ["amount > 100", "customer_id = 5"]},
                ["WHERE", "amount > 100", "customer_id = 5"],
            ),
            (
                {"vanilla": ["timestamp > '2024-01-01'", "value > 0"]},
                ["WHERE", "timestamp > '2024-01-01'", "value > 0"],
            ),
        ],
    )
    def test_filter_queries(self, query_builder_factory, filter_by, expected_conditions):
        """Test queries with various WHERE conditions."""
        builder = query_builder_factory(
            select_items={"id": "id", "amount": "amount"}, filter_by=filter_by
        )
        sql = builder.build()

        for condition in expected_conditions:
            assert_sql_contains(sql, condition)


# ============================================================================
# Test ORDER BY
# ============================================================================


class TestOrderBy:
    """Tests for ORDER BY clause."""

    @pytest.mark.parametrize(
        "order_by,select_items,expected_order",
        [
            (["amount DESC"], {"id": "id", "amount": "amount"}, ["ORDER BY", "DESC"]),
            (
                ["year", "month DESC"],
                {"year": "year", "month": "month"},
                ["ORDER BY", "year", "month", "DESC"],
            ),
            (
                ["total_revenue DESC", "region"],
                {"region": "region", "total_revenue": "SUM(amount)"},
                ["ORDER BY", "DESC", "region"],
            ),
        ],
    )
    def test_order_by_queries(self, query_builder_factory, order_by, select_items, expected_order):
        """Test queries with ORDER BY clauses."""
        builder = query_builder_factory(select_items=select_items, order_by=order_by)
        sql = builder.build()

        for expected in expected_order:
            assert_sql_contains(sql, expected)

    def test_order_by_with_group_by(self, query_builder_factory):
        """Test ORDER BY behavior when GROUP BY is present."""
        select_items = {"year": "year", "total_sales": "SUM(amount)"}
        builder = query_builder_factory(select_items=select_items, order_by=["year"])
        sql = builder.build()

        # Should have both GROUP BY and ORDER BY
        assert_sql_contains(sql, "GROUP BY", "ORDER BY")

        # ORDER BY should not reference base_model when GROUP BY is present
        if "GROUP BY" in sql and "ORDER BY" in sql:
            order_by_part = sql.split("ORDER BY")[1]
            assert "base_model.year" not in order_by_part.lower()


# ============================================================================
# Test Dialect-Specific Features
# ============================================================================


class TestDialectSpecific:
    """Tests for dialect-specific SQL generation."""

    @pytest.mark.parametrize(
        "dialect,source_type",
        [
            ("postgresql", "postgresql"),
            ("mysql", "mysql"),
            ("sqlite", "sqlite"),
            ("snowflake", "snowflake"),
            ("bigquery", "bigquery"),
        ],
    )
    def test_dialect_sql_generation(self, query_builder_factory, dialect, source_type):
        """Test SQL generation for different dialects."""
        builder = query_builder_factory(
            source_type=source_type, select_items={"id": "id", "created": "created_at"}
        )
        sql = builder.build()

        # Basic verification - should generate valid SQL for any dialect
        assert_sql_contains(sql, "WITH", "SELECT", "orders")

    def test_bigquery_nested_field_handling(self, query_builder_factory):
        """Test BigQuery-specific handling of nested fields with dots."""
        select_items = {
            "event_id": "event_id",
            "props.device.type": "props.device.type",
            "props.user.id": "props.user.id",
            "event_count": "COUNT(*)",
        }

        builder = query_builder_factory(source_type="bigquery", select_items=select_items)
        sql = builder.build()

        # BigQuery should sanitize dots in aliases to pipes
        assert_sql_contains(sql, "props|device|type", "props|user|id")
        # Original expressions should retain dots
        assert_sql_contains(sql, "props.device.type", "props.user.id")

    def test_snowflake_quoted_identifiers(self, basic_source, basic_project):
        """Test Snowflake handling of quoted identifiers."""
        model = SqlModelFactory(
            name="data",
            sql='SELECT "year", "month", value FROM data_table',
            source="ref(test_db)",
        )
        model.dimensions = [
            Dimension(name="year", expression='"year"', data_type="INTEGER"),
            Dimension(name="month", expression='"month"', data_type="INTEGER"),
            Dimension(name="value", expression="value", data_type="DECIMAL"),
        ]

        project = ProjectFactory(
            name="sf_project", sources=[basic_source], models=[model], dashboards=[]
        )

        tokenized = TokenizedTrace(
            sql=model.sql,
            cohort_on="",
            source=basic_source.name,
            source_type="snowflake",
            select_items={"year": '"year"', "month": '"month"', "total": "SUM(value)"},
            filter_by={},
            order_by=['"year"', '"month"'],
        )

        builder = SqlglotQueryBuilder(tokenized, project)
        sql = builder.build()

        # Should generate valid SQL with proper identifier handling
        assert sql is not None
        assert_sql_contains(sql, "SELECT")


# ============================================================================
# Test Complex Scenarios
# ============================================================================


class TestComplexScenarios:
    """Tests for complex query scenarios combining multiple features."""

    def test_complex_analytics_query(self, query_builder_factory):
        """Test a complex analytics query with multiple features."""
        select_items = {
            "event_type": "event_type",
            "user_count": "COUNT(DISTINCT customer_id)",
            "total_value": "SUM(amount)",
            "avg_value": "AVG(amount)",
        }
        filter_by = {"vanilla": ["amount > 0"]}
        order_by = ["total_value DESC", "event_type"]

        builder = query_builder_factory(
            select_items=select_items, filter_by=filter_by, order_by=order_by
        )
        sql = builder.build()

        # Verify all features are present
        assert_sql_contains(
            sql,
            "WITH",
            "COUNT(DISTINCT customer_id)",
            "SUM(amount)",
            "AVG(amount)",
            "WHERE",
            "amount > 0",
            "GROUP BY",
            "ORDER BY",
            case_sensitive=True,
        )

    def test_multi_model_join_query(self, basic_source):
        """Test queries involving multiple models with joins."""
        model1 = SqlModelFactory(
            name="users", sql="SELECT id, name FROM users_table", source="ref(test_db)"
        )
        model2 = SqlModelFactory(
            name="events", sql="SELECT user_id, event_type FROM events_table", source="ref(test_db)"
        )

        project = ProjectFactory(
            name="test_project", sources=[basic_source], models=[model1, model2], dashboards=[]
        )

        tokenized = TokenizedTrace(
            sql="SELECT u.name, e.event_type FROM users u JOIN events e ON u.id = e.user_id",
            cohort_on="",
            source=basic_source.name,
            source_type="sqlite",
            select_items={"user_name": "u.name", "event_type": "e.event_type"},
            filter_by={},
            order_by=["user_name"],
            models_used={"users": model1, "events": model2},
        )

        builder = SqlglotQueryBuilder(tokenized, project)
        sql = builder.build()

        assert_sql_contains(sql, "users", "events", "JOIN", "ORDER BY")


# ============================================================================
# Test Edge Cases and Error Handling
# ============================================================================


class TestEdgeCases:
    """Tests for edge cases and error handling."""

    def test_invalid_sql_expressions(self, query_builder_factory):
        """Test handling of invalid SQL in expressions."""
        # Test with unparseable expression (but still valid as column name)
        select_items = {
            "col1": "column_name",  # Simple column reference
            "col2": "$$invalid$$",  # Invalid SQL but valid column name
        }

        builder = query_builder_factory(select_items=select_items)
        sql = builder.build()

        # Should still generate SQL even with invalid expressions
        assert_sql_contains(sql, "WITH base_model AS", "SELECT")

    def test_alias_sanitization_with_dots(self, query_builder_factory):
        """Test that aliases with dots are properly sanitized."""
        select_items = {
            "props.x": "props.x",
            "props.y": "props.y",
            "props.z": "SUM(props.z)",
        }

        builder = query_builder_factory(
            source_type="bigquery", select_items=select_items, order_by=["props.x"]
        )
        sql = builder.build()

        # For BigQuery, dots should be replaced with pipes in aliases
        assert "props|x" in sql or "`props|x`" in sql
        assert "props|y" in sql or "`props|y`" in sql
        assert "props|z" in sql or "`props|z`" in sql


# ============================================================================
# Test Schema Building
# ============================================================================


class TestSchemaBuilding:
    """Tests for schema building from dimensions."""

    def test_schema_from_dimensions(self, basic_source):
        """Test schema building from model dimensions."""
        model = SqlModelFactory(
            name="test_model",
            sql="SELECT id, name, amount FROM test_table",
            source="ref(test_db)",
        )

        # Add explicit dimensions
        model.dimensions = [
            Dimension(name="id", expression="id", data_type="INTEGER"),
            Dimension(name="name", expression="name", data_type="VARCHAR"),
        ]

        # Add implicit dimensions
        model._implicit_dimensions = [
            Dimension(name="amount", expression="amount", data_type="DECIMAL"),
        ]

        project = ProjectFactory(
            name="test_project", sources=[basic_source], models=[model], dashboards=[]
        )

        tokenized = TokenizedTrace(
            sql=model.sql,
            cohort_on="",
            source=basic_source.name,
            source_type="snowflake",
            select_items={"id": "id", "name": "name", "total": "SUM(amount)"},
            filter_by={},
            order_by=["id"],
        )

        builder = SqlglotQueryBuilder(tokenized, project)
        schema = builder._build_schema_from_dimensions()

        assert schema is not None
        assert "base_model" in schema
        assert schema["base_model"]["id"] == "INTEGER"
        assert schema["base_model"]["name"] == "VARCHAR"
        assert schema["base_model"]["amount"] == "DECIMAL"
