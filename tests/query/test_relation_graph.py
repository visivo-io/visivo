"""
Unit tests for the RelationGraph class.
"""

import pytest
from visivo.query.relation_graph import (
    RelationGraph,
    AmbiguousJoinError,
    NoJoinPathError,
)
from visivo.models.project import Project
from visivo.models.models.sql_model import SqlModel
from visivo.models.relation import Relation
from visivo.models.sources.sqlite_source import SqliteSource


class TestRelationGraph:
    """Test suite for RelationGraph functionality."""

    def test_init_empty_project(self):
        """Test initialization with empty project."""
        project = Project(name="test_project")
        graph = RelationGraph(project)
        assert graph.graph.number_of_nodes() == 0
        assert graph.graph.number_of_edges() == 0

    def test_simple_two_model_relation(self):
        """Test building graph with two models and one relation."""
        source = SqliteSource(name="test_db", type="sqlite", database=":memory:")

        orders_model = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_db)")

        customers_model = SqlModel(
            name="customers", sql="SELECT * FROM customers", source="ref(test_db)"
        )

        # Create a relation between orders and customers
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

        graph = RelationGraph(project)

        # Check graph structure
        assert graph.graph.number_of_nodes() == 2
        assert graph.graph.number_of_edges() == 1
        assert graph.graph.has_node("orders")
        assert graph.graph.has_node("customers")
        assert graph.graph.has_edge("orders", "customers")

    def test_find_direct_join_path(self):
        """Test finding join path between directly connected models."""
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

        graph = RelationGraph(project)

        # Find join path
        path = graph.find_join_path(["orders", "customers"])

        assert len(path) == 1
        assert path[0][0] == "orders"
        assert path[0][1] == "customers"
        assert "orders.customer_id = customers.id" in path[0][2]

    def test_find_indirect_join_path(self):
        """Test finding join path through intermediate model."""
        source = SqliteSource(name="test_db", type="sqlite", database=":memory:")

        orders_model = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_db)")

        customers_model = SqlModel(
            name="customers", sql="SELECT * FROM customers", source="ref(test_db)"
        )

        products_model = SqlModel(
            name="products", sql="SELECT * FROM products", source="ref(test_db)"
        )

        # Create relations forming a chain: customers -> orders -> products
        relation1 = Relation(
            name="orders_customers",
            left_model="orders",
            right_model="customers",
            condition="orders.customer_id = customers.id",
        )

        relation2 = Relation(
            name="orders_products",
            left_model="orders",
            right_model="products",
            condition="orders.product_id = products.id",
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model, customers_model, products_model],
            relations=[relation1, relation2],
        )

        graph = RelationGraph(project)

        # Find path from customers to products (through orders)
        path = graph.find_join_path(["customers", "products"])

        assert len(path) == 2
        # Path should go customers -> orders -> products
        assert any("customers" in p[0] or "customers" in p[1] for p in path)
        assert any("products" in p[0] or "products" in p[1] for p in path)

    def test_no_join_path_error(self):
        """Test error when no join path exists between models."""
        source = SqliteSource(name="test_db", type="sqlite", database=":memory:")

        orders_model = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_db)")

        products_model = SqlModel(
            name="products", sql="SELECT * FROM products", source="ref(test_db)"
        )

        # No relations defined
        project = Project(
            name="test_project", sources=[source], models=[orders_model, products_model]
        )

        graph = RelationGraph(project)

        with pytest.raises(NoJoinPathError) as exc_info:
            graph.find_join_path(["orders", "products"])

        assert "No join path found" in str(exc_info.value)

    def test_minimum_spanning_tree_three_models(self):
        """Test finding minimum spanning tree for three models."""
        source = SqliteSource(name="test_db", type="sqlite", database=":memory:")

        orders_model = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_db)")

        customers_model = SqlModel(
            name="customers", sql="SELECT * FROM customers", source="ref(test_db)"
        )

        products_model = SqlModel(
            name="products", sql="SELECT * FROM products", source="ref(test_db)"
        )

        # Create relations forming a triangle
        relation1 = Relation(
            name="orders_customers",
            left_model="orders",
            right_model="customers",
            condition="orders.customer_id = customers.id",
        )

        relation2 = Relation(
            name="orders_products",
            left_model="orders",
            right_model="products",
            condition="orders.product_id = products.id",
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model, customers_model, products_model],
            relations=[relation1, relation2],
        )

        graph = RelationGraph(project)

        # Find spanning tree for all three models
        path = graph.find_join_path(["orders", "customers", "products"])

        # Should connect all three models with 2 edges
        assert len(path) == 2

    def test_get_connected_models(self):
        """Test getting all models connected to a given model."""
        source = SqliteSource(name="test_db", type="sqlite", database=":memory:")

        # Create a star topology with orders at center
        orders_model = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_db)")

        customers_model = SqlModel(
            name="customers", sql="SELECT * FROM customers", source="ref(test_db)"
        )

        products_model = SqlModel(
            name="products", sql="SELECT * FROM products", source="ref(test_db)"
        )

        shipping_model = SqlModel(
            name="shipping", sql="SELECT * FROM shipping", source="ref(test_db)"
        )

        relations = [
            Relation(
                name="r1",
                left_model="orders",
                right_model="customers",
                condition="orders.customer_id = customers.id",
            ),
            Relation(
                name="r2",
                left_model="orders",
                right_model="products",
                condition="orders.product_id = products.id",
            ),
            Relation(
                name="r3",
                left_model="orders",
                right_model="shipping",
                condition="orders.shipping_id = shipping.id",
            ),
        ]

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model, customers_model, products_model, shipping_model],
            relations=relations,
        )

        graph = RelationGraph(project)

        # From orders, all other models should be reachable
        connected = graph.get_connected_models("orders")
        assert connected == {"customers", "products", "shipping"}

        # From customers, all should be reachable through orders
        connected = graph.get_connected_models("customers")
        assert "orders" in connected
        assert "products" in connected
        assert "shipping" in connected

    def test_validate_relations(self):
        """Test validation of relations."""
        source = SqliteSource(name="test_db", type="sqlite", database=":memory:")

        # Create disconnected models
        orders_model = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_db)")

        customers_model = SqlModel(
            name="customers", sql="SELECT * FROM customers", source="ref(test_db)"
        )

        # Isolated model with no relations
        products_model = SqlModel(
            name="products", sql="SELECT * FROM products", source="ref(test_db)"
        )

        # Only connect orders and customers
        relation = Relation(
            name="orders_customers",
            left_model="orders",
            right_model="customers",
            condition="orders.customer_id = customers.id",
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model, customers_model, products_model],
            relations=[relation],
        )

        graph = RelationGraph(project)
        warnings = graph.validate_relations()

        # Should warn about disconnected components
        assert any("disconnected" in w for w in warnings)

    def test_ref_syntax_in_relations(self):
        """Test parsing relations with ${ref()} syntax."""
        source = SqliteSource(name="test_db", type="sqlite", database=":memory:")

        orders_model = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_db)")

        customers_model = SqlModel(
            name="customers", sql="SELECT * FROM customers", source="ref(test_db)"
        )

        # Use ${ref()} syntax in relation
        relation = Relation(
            name="orders_customers",
            left_model="orders",
            right_model="customers",
            condition="${ref(orders).customer_id} = ${ref(customers).id}",
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model, customers_model],
            relations=[relation],
        )

        graph = RelationGraph(project)

        # Should still parse correctly
        assert graph.graph.has_edge("orders", "customers")

    def test_get_join_condition(self):
        """Test getting direct join condition between two models."""
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

        graph = RelationGraph(project)

        # Get direct condition
        condition = graph.get_join_condition("orders", "customers")
        assert condition == "orders.customer_id = customers.id"

        # No direct relation
        condition = graph.get_join_condition("orders", "orders")
        assert condition is None
