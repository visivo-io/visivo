"""
Unit tests for the MultiModelQueryBuilder class.
"""

import pytest
from visivo.query.multi_model_query_builder import MultiModelQueryBuilder
from visivo.models.project import Project
from visivo.models.models.sql_model import SqlModel
from visivo.models.relation import Relation
from visivo.models.sources.sqlite_source import SqliteSource
from visivo.models.tokenized_trace import TokenizedTrace
import sqlglot


class TestMultiModelQueryBuilder:
    """Test suite for MultiModelQueryBuilder functionality."""

    def test_init_empty_project(self):
        """Test initialization with empty project."""
        project = Project(name="test_project")
        builder = MultiModelQueryBuilder(project)
        assert builder.project == project
        assert builder.relation_graph is not None

    def test_build_query_with_no_cross_model_refs(self):
        """Test that queries without cross-model references are unchanged."""
        source = SqliteSource(name="test_db", type="sqlite", database=":memory:")

        orders_model = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_db)")

        project = Project(name="test_project", sources=[source], models=[orders_model])

        builder = MultiModelQueryBuilder(project)

        tokenized = TokenizedTrace(
            sql="SELECT SUM(amount) FROM orders",
            cohort_on="'test'",
            source="test_db",
            source_type="sqlite",
            select_items={"y": "SUM(amount)"},
        )

        # No referenced models, should return original SQL
        result = builder.build_multi_model_query(tokenized, orders_model, [])
        assert result == "SELECT SUM(amount) FROM orders"

    def test_build_simple_two_model_join(self):
        """Test building a query joining two models."""
        source = SqliteSource(name="test_db", type="sqlite", database=":memory:")

        orders_model = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_db)")

        customers_model = SqlModel(
            name="customers", sql="SELECT * FROM customers", source="ref(test_db)"
        )

        relation = Relation(
            name="orders_customers",
            left_model="orders",
            right_model="customers",
            condition="orders.customer_id = customers.id",
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model, customers_model],
            relations=[relation],
        )

        builder = MultiModelQueryBuilder(project)

        tokenized = TokenizedTrace(
            sql="SELECT orders.amount, customers.name FROM orders",
            cohort_on="'test'",
            source="test_db",
            source_type="sqlite",
            select_items={"amount": "orders.amount", "customer": "customers.name"},
            referenced_models=["customers"],
        )

        # Build query with join
        result = builder.build_multi_model_query(tokenized, orders_model, ["customers"])

        # Parse and verify the result has a JOIN
        parsed = sqlglot.parse_one(result)
        joins = list(parsed.find_all(sqlglot.exp.Join))
        assert len(joins) == 1
        assert "customers" in result.lower()
        assert "join" in result.lower()

    def test_build_three_model_join(self):
        """Test building a query joining three models."""
        source = SqliteSource(name="test_db", type="sqlite", database=":memory:")

        orders_model = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_db)")

        customers_model = SqlModel(
            name="customers", sql="SELECT * FROM customers", source="ref(test_db)"
        )

        products_model = SqlModel(
            name="products", sql="SELECT * FROM products", source="ref(test_db)"
        )

        relations = [
            Relation(
                name="orders_customers",
                left_model="orders",
                right_model="customers",
                condition="orders.customer_id = customers.id",
            ),
            Relation(
                name="orders_products",
                left_model="orders",
                right_model="products",
                condition="orders.product_id = products.id",
            ),
        ]

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model, customers_model, products_model],
            relations=relations,
        )

        builder = MultiModelQueryBuilder(project)

        tokenized = TokenizedTrace(
            sql="SELECT orders.amount, customers.name, products.category FROM orders",
            cohort_on="'test'",
            source="test_db",
            source_type="sqlite",
            select_items={
                "amount": "orders.amount",
                "customer": "customers.name",
                "category": "products.category",
            },
            referenced_models=["customers", "products"],
        )

        # Build query with multiple joins
        result = builder.build_multi_model_query(tokenized, orders_model, ["customers", "products"])

        # Parse and verify the result has two JOINs
        parsed = sqlglot.parse_one(result)
        joins = list(parsed.find_all(sqlglot.exp.Join))
        assert len(joins) == 2
        assert "customers" in result.lower()
        assert "products" in result.lower()

    def test_handle_group_by_with_multiple_models(self):
        """Test GROUP BY handling with fields from multiple models."""
        source = SqliteSource(name="test_db", type="sqlite", database=":memory:")

        orders_model = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_db)")

        customers_model = SqlModel(
            name="customers", sql="SELECT * FROM customers", source="ref(test_db)"
        )

        relation = Relation(
            name="orders_customers",
            left_model="orders",
            right_model="customers",
            condition="orders.customer_id = customers.id",
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model, customers_model],
            relations=[relation],
        )

        builder = MultiModelQueryBuilder(project)

        # Query with aggregation and non-aggregated field from another model
        tokenized = TokenizedTrace(
            sql="SELECT customers.region, SUM(orders.amount) FROM orders",
            cohort_on="'test'",
            source="test_db",
            source_type="sqlite",
            select_items={"region": "customers.region", "total": "SUM(orders.amount)"},
            referenced_models=["customers"],
        )

        result = builder.build_multi_model_query(tokenized, orders_model, ["customers"])

        # Should have GROUP BY for the non-aggregated field
        assert "group by" in result.lower()
        assert "customers.region" in result.lower()

    def test_validate_cross_model_references(self):
        """Test validation of cross-model references."""
        source = SqliteSource(name="test_db", type="sqlite", database=":memory:")

        orders_model = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_db)")

        project = Project(name="test_project", sources=[source], models=[orders_model])

        builder = MultiModelQueryBuilder(project)

        tokenized = TokenizedTrace(
            sql="SELECT * FROM orders",
            cohort_on="'test'",
            source="test_db",
            source_type="sqlite",
            select_items={"all": "*"},
        )

        # Validate references to non-existent model
        warnings = builder.validate_cross_model_references(
            tokenized, orders_model, ["nonexistent_model"]
        )

        assert len(warnings) > 0
        assert "not found" in warnings[0]

    def test_validate_no_join_path(self):
        """Test validation when no join path exists."""
        source = SqliteSource(name="test_db", type="sqlite", database=":memory:")

        orders_model = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_db)")

        products_model = SqlModel(
            name="products", sql="SELECT * FROM products", source="ref(test_db)"
        )

        # No relations between models
        project = Project(
            name="test_project", sources=[source], models=[orders_model, products_model]
        )

        builder = MultiModelQueryBuilder(project)

        tokenized = TokenizedTrace(
            sql="SELECT * FROM orders",
            cohort_on="'test'",
            source="test_db",
            source_type="sqlite",
            select_items={"all": "*"},
        )

        # Should warn about no join path
        warnings = builder.validate_cross_model_references(tokenized, orders_model, ["products"])

        assert len(warnings) > 0
        assert "No join path" in warnings[0]

    def test_get_required_fields(self):
        """Test extracting required fields from a specific model."""
        project = Project(name="test_project")
        builder = MultiModelQueryBuilder(project)

        tokenized = TokenizedTrace(
            sql="SELECT orders.amount, customers.name FROM orders",
            cohort_on="'test'",
            source="test_db",
            source_type="sqlite",
            select_items={
                "amount": "orders.amount",
                "customer": "customers.name",
                "total": "SUM(orders.revenue)",
            },
        )

        # Get fields required from orders model
        orders_fields = builder.get_required_fields(tokenized, "orders")
        assert "amount" in orders_fields
        assert "revenue" in orders_fields

        # Get fields required from customers model
        customers_fields = builder.get_required_fields(tokenized, "customers")
        assert "name" in customers_fields

    def test_optimize_join_order(self):
        """Test join order optimization based on statistics."""
        project = Project(name="test_project")
        builder = MultiModelQueryBuilder(project)

        models = ["orders", "customers", "products"]

        # No statistics - should return original order
        result = builder.optimize_join_order(models)
        assert result == models

        # With statistics - should order by row count
        statistics = {"orders": 10000, "customers": 100, "products": 50}

        result = builder.optimize_join_order(models, statistics)
        assert result == ["products", "customers", "orders"]

    def test_error_handling(self):
        """Test error handling in query building."""
        project = Project(name="test_project")
        builder = MultiModelQueryBuilder(project)

        # Invalid SQL in tokenized trace
        tokenized = TokenizedTrace(
            sql="INVALID SQL SYNTAX !!!",
            cohort_on="'test'",
            source="test_db",
            source_type="sqlite",
            select_items={},
        )

        orders_model = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_db)")

        # Should return original SQL on error
        result = builder.build_multi_model_query(tokenized, orders_model, ["customers"])

        assert result == "INVALID SQL SYNTAX !!!"
