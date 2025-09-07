"""
Tests for DimensionResolver cross-model dimension resolution.
"""

import pytest
from visivo.query.dimension_resolver import DimensionResolver, DimensionNotFoundError
from visivo.models.dimension import Dimension
from visivo.models.project import Project
from tests.factories.model_factories import (
    SourceFactory,
    SqlModelFactory,
    ProjectFactory,
)


class TestDimensionResolver:
    """Test suite for DimensionResolver."""

    def test_find_explicit_dimension(self):
        """Test finding explicitly defined dimensions."""
        source = SourceFactory(name="test_db")
        model = SqlModelFactory(
            name="users",
            sql="SELECT id, name, email FROM users_table",
            source="ref(test_db)",
        )

        # Add explicit dimensions
        model.dimensions = [
            Dimension(name="user_id", expression="id", data_type="INTEGER"),
            Dimension(name="user_name", expression="name", data_type="VARCHAR"),
        ]

        project = ProjectFactory(
            name="test_project",
            sources=[source],
            models=[model],
            dashboards=[],
        )

        resolver = DimensionResolver(project)

        # Test finding dimension by simple name
        result = resolver.find_dimension("user_id")
        assert result is not None
        model_found, dimension_found = result
        assert model_found.name == "users"
        assert dimension_found.name == "user_id"
        assert dimension_found.expression == "id"

        # Test finding dimension by qualified name
        result = resolver.find_dimension("users.user_id")
        assert result is not None
        model_found, dimension_found = result
        assert model_found.name == "users"
        assert dimension_found.name == "user_id"

    def test_find_implicit_dimension(self):
        """Test finding implicitly created dimensions from columns."""
        source = SourceFactory(name="test_db")
        model = SqlModelFactory(
            name="orders",
            sql="SELECT order_id, customer_id, amount, order_date FROM orders_table",
            source="ref(test_db)",
        )

        # Simulate implicit dimensions created by extract_dimensions_job
        model._implicit_dimensions = [
            Dimension(name="order_id", expression="order_id", data_type="INTEGER"),
            Dimension(name="customer_id", expression="customer_id", data_type="INTEGER"),
            Dimension(name="amount", expression="amount", data_type="DECIMAL"),
            Dimension(name="order_date", expression="order_date", data_type="DATE"),
        ]

        project = ProjectFactory(
            name="test_project",
            sources=[source],
            models=[model],
            dashboards=[],
        )

        resolver = DimensionResolver(project)

        # Test finding implicit dimension
        result = resolver.find_dimension("order_id")
        assert result is not None
        model_found, dimension_found = result
        assert model_found.name == "orders"
        assert dimension_found.name == "order_id"
        assert dimension_found.expression == "order_id"

        # Test with qualified name
        result = resolver.find_dimension("orders.amount")
        assert result is not None
        model_found, dimension_found = result
        assert dimension_found.name == "amount"
        assert dimension_found.data_type == "DECIMAL"

    def test_resolve_dimension_expression(self):
        """Test resolving dimension references to SQL expressions."""
        source = SourceFactory(name="test_db")
        model = SqlModelFactory(
            name="sales",
            sql="SELECT id, region, revenue, year FROM sales_table",
            source="ref(test_db)",
        )

        # Add explicit dimension with custom expression
        model.dimensions = [
            Dimension(name="fiscal_year", expression="year + 1", data_type="INTEGER"),
            Dimension(name="region_upper", expression="UPPER(region)", data_type="VARCHAR"),
        ]

        project = ProjectFactory(
            name="test_project",
            sources=[source],
            models=[model],
            dashboards=[],
        )

        resolver = DimensionResolver(project)

        # Test resolving simple dimension
        expression = resolver.resolve_dimension_expression("fiscal_year")
        assert expression == "year + 1"

        # Test resolving with model qualifier
        expression = resolver.resolve_dimension_expression("sales.region_upper")
        assert expression == "UPPER(region)"

        # Test with current model context
        expression = resolver.resolve_dimension_expression("fiscal_year", current_model="sales")
        assert expression == "year + 1"

    def test_dimension_not_found_error(self):
        """Test that DimensionNotFoundError is raised for missing dimensions."""
        source = SourceFactory(name="test_db")
        model = SqlModelFactory(
            name="test",
            sql="SELECT id FROM test_table",
            source="ref(test_db)",
        )

        project = ProjectFactory(
            name="test_project",
            sources=[source],
            models=[model],
            dashboards=[],
        )

        resolver = DimensionResolver(project)

        # Test non-existent dimension
        with pytest.raises(DimensionNotFoundError) as exc_info:
            resolver.resolve_dimension_expression("non_existent_dimension")

        assert "non_existent_dimension" in str(exc_info.value)
        assert "not found" in str(exc_info.value)

    def test_cross_model_dimension_resolution(self):
        """Test resolving dimensions across different models."""
        source = SourceFactory(name="test_db")

        # First model with dimensions
        users_model = SqlModelFactory(
            name="users",
            sql="SELECT id, name, created_at FROM users_table",
            source="ref(test_db)",
        )
        users_model.dimensions = [
            Dimension(name="user_id", expression="id", data_type="INTEGER"),
            Dimension(name="username", expression="name", data_type="VARCHAR"),
        ]

        # Second model with different dimensions
        orders_model = SqlModelFactory(
            name="orders",
            sql="SELECT order_id, user_id, amount FROM orders_table",
            source="ref(test_db)",
        )
        orders_model.dimensions = [
            Dimension(name="order_id", expression="order_id", data_type="INTEGER"),
            Dimension(name="total", expression="amount * 1.1", data_type="DECIMAL"),
        ]

        project = ProjectFactory(
            name="test_project",
            sources=[source],
            models=[users_model, orders_model],
            dashboards=[],
        )

        resolver = DimensionResolver(project)

        # Test cross-model resolution - dimension from users model
        expression = resolver.resolve_dimension_expression("users.username")
        assert expression == "name"

        # Test cross-model resolution - dimension from orders model
        expression = resolver.resolve_dimension_expression("orders.total")
        assert expression == "amount * 1.1"

        # Test that dimensions are properly scoped to their models
        result = resolver.find_dimension("users.user_id")
        assert result is not None
        model_found, _ = result
        assert model_found.name == "users"

        result = resolver.find_dimension("orders.order_id")
        assert result is not None
        model_found, _ = result
        assert model_found.name == "orders"

    def test_dimension_expression_caching(self):
        """Test that resolved dimensions are cached for performance."""
        source = SourceFactory(name="test_db")
        model = SqlModelFactory(
            name="metrics",
            sql="SELECT id, value FROM metrics_table",
            source="ref(test_db)",
        )

        model.dimensions = [
            Dimension(name="squared_value", expression="value * value", data_type="DECIMAL"),
        ]

        project = ProjectFactory(
            name="test_project",
            sources=[source],
            models=[model],
            dashboards=[],
        )

        resolver = DimensionResolver(project)

        # First resolution - should cache the result
        expression1 = resolver.resolve_dimension_expression("squared_value")
        assert expression1 == "value * value"

        # Check cache is populated
        cache_key = "squared_value"
        assert cache_key in resolver._dimension_cache
        assert resolver._dimension_cache[cache_key] == "value * value"

        # Second resolution - should use cached result
        expression2 = resolver.resolve_dimension_expression("squared_value")
        assert expression2 == expression1

        # Test with model context caching
        expression3 = resolver.resolve_dimension_expression(
            "squared_value", current_model="metrics"
        )
        cache_key_with_context = "metrics.squared_value"
        assert cache_key_with_context in resolver._dimension_cache

    def test_resolve_dimension_reference(self):
        """Test resolving ${ref(model).dimension} references."""
        source = SourceFactory(name="test_db")

        model = SqlModelFactory(
            name="products",
            sql="SELECT id, name, price, category FROM products_table",
            source="ref(test_db)",
        )

        model.dimensions = [
            Dimension(name="product_id", expression="id", data_type="INTEGER"),
            Dimension(name="price_with_tax", expression="price * 1.08", data_type="DECIMAL"),
        ]

        project = ProjectFactory(
            name="test_project",
            sources=[source],
            models=[model],
            dashboards=[],
        )

        resolver = DimensionResolver(project)

        # Test ${ref(model).dimension} format
        expression, models = resolver.resolve_dimension_reference("${ref(products).price_with_tax}")
        assert expression == "price * 1.08"
        assert "products" in models

        # Test ${ref(dimension)} format (unqualified)
        expression, models = resolver.resolve_dimension_reference(
            "${ref(product_id)}", current_model="products"
        )
        assert expression == "id"
        assert "products" in models

        # Test non-dimension reference (should return as-is)
        expression, models = resolver.resolve_dimension_reference("${ref(some_other_thing)}")
        assert expression == "${ref(some_other_thing)}"
        assert len(models) == 0

    def test_get_models_from_dimension(self):
        """Test getting model references from dimensions."""
        source = SourceFactory(name="test_db")

        model = SqlModelFactory(
            name="events",
            sql="SELECT event_id, user_id, timestamp FROM events_table",
            source="ref(test_db)",
        )

        model.dimensions = [
            Dimension(name="event_id", expression="event_id", data_type="VARCHAR"),
            Dimension(name="event_time", expression="timestamp", data_type="TIMESTAMP"),
        ]

        project = ProjectFactory(
            name="test_project",
            sources=[source],
            models=[model],
            dashboards=[],
        )

        resolver = DimensionResolver(project)

        # Test getting models from dimension
        models = resolver.get_models_from_dimension("event_id")
        assert models == {"events"}

        # Test with qualified dimension name
        models = resolver.get_models_from_dimension("events.event_time")
        assert models == {"events"}

        # Test with non-existent dimension
        models = resolver.get_models_from_dimension("non_existent")
        assert len(models) == 0

    def test_mixed_explicit_and_implicit_dimensions(self):
        """Test that explicit dimensions take precedence over implicit ones."""
        source = SourceFactory(name="test_db")
        model = SqlModelFactory(
            name="data",
            sql="SELECT id, name, value FROM data_table",
            source="ref(test_db)",
        )

        # Add explicit dimension that overrides column
        model.dimensions = [
            Dimension(
                name="value",  # Same name as column
                expression="value * 100",  # Different expression
                data_type="DECIMAL",
            ),
        ]

        # Add implicit dimensions for other columns
        model._implicit_dimensions = [
            Dimension(name="id", expression="id", data_type="INTEGER"),
            Dimension(name="name", expression="name", data_type="VARCHAR"),
            Dimension(name="value", expression="value", data_type="DECIMAL"),  # Would be overridden
        ]

        project = ProjectFactory(
            name="test_project",
            sources=[source],
            models=[model],
            dashboards=[],
        )

        resolver = DimensionResolver(project)

        # Explicit dimension should take precedence
        expression = resolver.resolve_dimension_expression("value")
        assert expression == "value * 100"  # Explicit expression, not the implicit "value"

        # Implicit dimensions should still work for other columns
        expression = resolver.resolve_dimension_expression("id")
        assert expression == "id"

        expression = resolver.resolve_dimension_expression("name")
        assert expression == "name"
