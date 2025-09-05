"""
Tests for multi-model query generation with JOINs.
"""

import pytest
from unittest.mock import Mock
from visivo.query.sqlglot_query_builder import SqlglotQueryBuilder
from visivo.query.relation_graph import NoJoinPathError, AmbiguousJoinError
from visivo.models.tokenized_trace import TokenizedTrace
from visivo.models.project import Project
from visivo.models.sources.sqlite_source import SqliteSource
from visivo.models.models.sql_model import SqlModel
from visivo.models.relation import Relation
from visivo.models.metric import Metric


class TestMultiModelQueries:
    """Test suite for multi-model SQL generation with JOINs."""

    def test_simple_two_model_join(self):
        """Test joining two models with a simple relation."""
        # Create models
        orders_model = SqlModel(
            name="orders", sql="SELECT * FROM orders_table", source="ref(test_db)"
        )

        users_model = SqlModel(name="users", sql="SELECT * FROM users_table", source="ref(test_db)")

        # Create relation
        relation = Relation(
            name="orders_to_users",
            condition="${ref(orders).user_id} = ${ref(users).id}",
            join_type="inner",
        )

        # Create source
        source = SqliteSource(name="test_db", type="sqlite", database=":memory:")

        # Create project with models and relations
        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model, users_model],
            relations=[relation],
        )

        # Create tokenized trace that references both models
        tokenized = TokenizedTrace(
            sql="SELECT * FROM orders_table",  # Base model SQL
            cohort_on="'test'",
            source="test_db",
            source_type="sqlite",
            columns=["order_id", "user_id", "amount", "username", "email"],
            select_items={"order_id": "order_id", "username": "username", "total": "SUM(amount)"},
            filter_by={},
            referenced_models=["orders", "users"],  # Both models referenced
        )

        # Build query
        builder = SqlglotQueryBuilder(tokenized_trace=tokenized, project=project)
        sql = builder.build()

        print(f"Generated two-model JOIN SQL:\n{sql}")

        # Verify CTEs for both models
        assert "orders_cte AS" in sql
        assert "users_cte AS" in sql

        # Verify JOIN clause
        assert "JOIN" in sql.upper()
        assert "orders_cte.user_id = users_cte.id" in sql

        # Verify FROM clause references CTE
        assert "FROM orders_cte" in sql

    def test_three_model_join_chain(self):
        """Test joining three models in a chain: orders -> users -> departments."""
        # Create models
        orders_model = SqlModel(
            name="orders", sql="SELECT * FROM orders_table", source="ref(test_db)"
        )

        users_model = SqlModel(name="users", sql="SELECT * FROM users_table", source="ref(test_db)")

        departments_model = SqlModel(
            name="departments", sql="SELECT * FROM departments_table", source="ref(test_db)"
        )

        # Create relations
        orders_users = Relation(
            name="orders_to_users",
            condition="${ref(orders).user_id} = ${ref(users).id}",
            join_type="inner",
        )

        users_departments = Relation(
            name="users_to_departments",
            condition="${ref(users).department_id} = ${ref(departments).id}",
            join_type="inner",
        )

        source = SqliteSource(name="test_db", type="sqlite", database=":memory:")

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model, users_model, departments_model],
            relations=[orders_users, users_departments],
        )

        # Create tokenized trace referencing all three models
        tokenized = TokenizedTrace(
            sql="SELECT * FROM orders_table",
            cohort_on="'test'",
            source="test_db",
            source_type="sqlite",
            columns=["order_id", "amount", "username", "department_name"],
            select_items={
                "order_id": "order_id",
                "username": "username",
                "department": "department_name",
                "total": "SUM(amount)",
            },
            filter_by={},
            referenced_models=["orders", "users", "departments"],
        )

        builder = SqlglotQueryBuilder(tokenized_trace=tokenized, project=project)
        sql = builder.build()

        print(f"Generated three-model JOIN SQL:\n{sql}")

        # Verify all CTEs
        assert "orders_cte AS" in sql
        assert "users_cte AS" in sql
        assert "departments_cte AS" in sql

        # Verify both JOINs
        assert sql.upper().count("JOIN") >= 2
        assert "orders_cte.user_id = users_cte.id" in sql
        assert "users_cte.department_id = departments_cte.id" in sql

    def test_missing_relation_error(self):
        """Test that missing relations produce clear error messages."""
        # Create models without relations
        orders_model = SqlModel(
            name="orders", sql="SELECT * FROM orders_table", source="ref(test_db)"
        )

        products_model = SqlModel(
            name="products", sql="SELECT * FROM products_table", source="ref(test_db)"
        )

        source = SqliteSource(name="test_db", type="sqlite", database=":memory:")

        # Project has models but no relations
        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model, products_model],
            relations=[],  # No relations!
        )

        # Tokenized trace references both models
        tokenized = TokenizedTrace(
            sql="SELECT * FROM orders_table",
            cohort_on="'test'",
            source="test_db",
            source_type="sqlite",
            columns=["order_id", "product_name"],
            select_items={"order_id": "order_id", "product": "product_name"},
            filter_by={},
            referenced_models=["orders", "products"],
        )

        builder = SqlglotQueryBuilder(tokenized_trace=tokenized, project=project)

        # Should raise an error about missing relation
        with pytest.raises(ValueError) as exc_info:
            sql = builder.build()

        assert "Cannot join models" in str(exc_info.value)

    def test_cross_model_metric_with_aggregates(self):
        """Test cross-model metrics that use aggregates from different models."""
        # Create models
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source="ref(test_db)",
            metrics=[Metric(name="total_revenue", expression="SUM(amount)")],
        )

        users_model = SqlModel(
            name="users",
            sql="SELECT * FROM users_table",
            source="ref(test_db)",
            metrics=[Metric(name="user_count", expression="COUNT(DISTINCT id)")],
        )

        # Create relation
        relation = Relation(
            name="orders_to_users",
            condition="${ref(orders).user_id} = ${ref(users).id}",
            join_type="inner",
        )

        source = SqliteSource(name="test_db", type="sqlite", database=":memory:")

        # Create a cross-model metric
        revenue_per_user = Metric(
            name="revenue_per_user",
            expression="${ref(orders.total_revenue)} / ${ref(users.user_count)}",
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model, users_model],
            relations=[relation],
            metrics=[revenue_per_user],
        )

        # Tokenized trace using cross-model metric
        tokenized = TokenizedTrace(
            sql="SELECT * FROM orders_table",
            cohort_on="'test'",
            source="test_db",
            source_type="sqlite",
            columns=["region"],
            select_items={
                "region": "region",
                "avg_revenue": "(SUM(amount)) / (COUNT(DISTINCT id))",  # Resolved metric
            },
            filter_by={},
            referenced_models=["orders", "users"],
        )

        builder = SqlglotQueryBuilder(tokenized_trace=tokenized, project=project)
        sql = builder.build()

        print(f"Generated cross-model metric SQL:\n{sql}")

        # Verify both models are in CTEs
        assert "orders_cte AS" in sql
        assert "users_cte AS" in sql

        # Verify JOIN
        assert "JOIN" in sql.upper()

        # Verify aggregates in SELECT
        assert "SUM" in sql.upper()
        assert "COUNT" in sql.upper()

    def test_complex_case_with_multiple_models(self):
        """Test CASE statements that reference columns from different models."""
        orders_model = SqlModel(
            name="orders", sql="SELECT * FROM orders_table", source="ref(test_db)"
        )

        users_model = SqlModel(name="users", sql="SELECT * FROM users_table", source="ref(test_db)")

        relation = Relation(
            name="orders_to_users",
            condition="${ref(orders).user_id} = ${ref(users).id}",
            join_type="left",
        )

        source = SqliteSource(name="test_db", type="sqlite", database=":memory:")

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model, users_model],
            relations=[relation],
        )

        # CASE statement referencing both models
        tokenized = TokenizedTrace(
            sql="SELECT * FROM orders_table",
            cohort_on="'test'",
            source="test_db",
            source_type="sqlite",
            columns=["order_status", "user_type", "amount"],
            select_items={
                "revenue_category": """
                    CASE
                        WHEN order_status = 'completed' AND user_type = 'premium' THEN 'High Value'
                        WHEN order_status = 'completed' AND user_type = 'regular' THEN 'Standard'
                        ELSE 'Other'
                    END
                """,
                "total": "SUM(amount)",
            },
            filter_by={},
            referenced_models=["orders", "users"],
        )

        builder = SqlglotQueryBuilder(tokenized_trace=tokenized, project=project)
        sql = builder.build()

        print(f"Generated SQL with CASE across models:\n{sql}")

        # Verify CASE statement is preserved
        assert "CASE" in sql.upper()
        assert "order_status" in sql
        assert "user_type" in sql

        # Verify JOIN (should be LEFT JOIN based on relation)
        assert "JOIN" in sql.upper()

    def test_filter_with_multiple_models(self):
        """Test WHERE clause with conditions from multiple models."""
        orders_model = SqlModel(
            name="orders", sql="SELECT * FROM orders_table", source="ref(test_db)"
        )

        users_model = SqlModel(name="users", sql="SELECT * FROM users_table", source="ref(test_db)")

        relation = Relation(
            name="orders_to_users",
            condition="${ref(orders).user_id} = ${ref(users).id}",
            join_type="inner",
        )

        source = SqliteSource(name="test_db", type="sqlite", database=":memory:")

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model, users_model],
            relations=[relation],
        )

        # Filters referencing both models
        tokenized = TokenizedTrace(
            sql="SELECT * FROM orders_table",
            cohort_on="'test'",
            source="test_db",
            source_type="sqlite",
            columns=["order_date", "amount", "country"],
            select_items={"month": "DATE_TRUNC('month', order_date)", "total": "SUM(amount)"},
            filter_by={
                "vanilla": [
                    "order_date >= '2024-01-01'",  # From orders
                    "country = 'USA'",  # From users
                ],
                "aggregate": ["SUM(amount) > 1000"],
            },
            referenced_models=["orders", "users"],
        )

        builder = SqlglotQueryBuilder(tokenized_trace=tokenized, project=project)
        sql = builder.build()

        print(f"Generated SQL with multi-model filters:\n{sql}")

        # Verify WHERE clause has both conditions
        assert "WHERE" in sql.upper()
        assert "order_date >= '2024-01-01'" in sql
        assert "country = 'USA'" in sql

        # Verify HAVING clause
        assert "HAVING" in sql.upper()
        assert "SUM(amount) > 1000" in sql

    def test_multi_model_with_cohort_on(self):
        """Test that cohort_on is included in multi-model queries."""
        # Create two models
        orders_model = SqlModel(
            name="orders", sql="SELECT * FROM orders_table", source="ref(test_db)"
        )

        users_model = SqlModel(name="users", sql="SELECT * FROM users_table", source="ref(test_db)")

        # Create a relation
        relation = Relation(
            name="orders_users",
            condition="${ref(orders).user_id} = ${ref(users).id}",
            join_type="inner",
        )

        source = SqliteSource(name="test_db", type="sqlite", database=":memory:")

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model, users_model],
            relations=[relation],
        )

        # Create tokenized trace with cohort_on
        tokenized = TokenizedTrace(
            sql="SELECT * FROM orders_table",
            cohort_on="'Q3_2024'",  # Literal cohort value
            source="test_db",
            source_type="sqlite",
            columns=["user_id", "order_amount", "user_name"],
            select_items={
                "total_orders": "SUM(order_amount)",
                "user_count": "COUNT(DISTINCT users.id)",
            },
            filter_by={},
            referenced_models=["orders", "users"],
        )

        builder = SqlglotQueryBuilder(tokenized_trace=tokenized, project=project)
        sql = builder.build()

        print(f"Multi-model SQL with cohort_on:\n{sql}")

        # Check that cohort_on appears in SELECT
        assert '"cohort_on"' in sql or 'AS "cohort_on"' in sql
        assert "'Q3_2024'" in sql

        # Should have CTEs for both models
        assert "WITH" in sql.upper()
        assert "orders_cte" in sql
        assert "users_cte" in sql

        # Should have JOIN
        assert "JOIN" in sql.upper()

        # Should have GROUP BY with cohort_on
        if "GROUP BY" in sql.upper():
            group_by_clause = sql.upper().split("GROUP BY")[1]
            assert "COHORT_ON" in group_by_clause
