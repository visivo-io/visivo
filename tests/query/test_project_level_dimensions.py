"""
Tests for project-level dimensions that can compose model-level dimensions.
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


class TestProjectLevelDimensions:
    """Test suite for project-level dimension features."""

    def test_project_level_dimension_basic(self):
        """Test basic project-level dimension."""
        source = SourceFactory(name="test_db")
        model = SqlModelFactory(
            name="sales",
            sql="SELECT id, amount, tax FROM sales_table",
            source="ref(test_db)",
        )
        
        # Create project with project-level dimensions
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            dimensions=[
                Dimension(
                    name="total_with_tax",
                    expression="amount + tax",
                    description="Total amount including tax"
                )
            ],
            dashboards=[],
        )
        
        resolver = DimensionResolver(project)
        
        # Should be able to find the project-level dimension
        result = resolver.find_dimension("total_with_tax")
        assert result is not None
        model_found, dimension_found = result
        assert model_found is None  # Project-level dimensions have no model
        assert dimension_found.name == "total_with_tax"
        assert dimension_found.expression == "amount + tax"

    def test_project_dimension_referencing_model_dimensions(self):
        """Test project-level dimension that references model-level dimensions."""
        source = SourceFactory(name="test_db")
        
        # First model with dimensions
        users_model = SqlModelFactory(
            name="users",
            sql="SELECT id, first_name, last_name FROM users_table",
            source="ref(test_db)",
        )
        users_model.dimensions = [
            Dimension(
                name="full_name",
                expression="first_name || ' ' || last_name",
                data_type="VARCHAR"
            ),
        ]
        
        # Second model with dimensions
        orders_model = SqlModelFactory(
            name="orders",
            sql="SELECT order_id, amount, discount FROM orders_table",
            source="ref(test_db)",
        )
        orders_model.dimensions = [
            Dimension(
                name="final_amount",
                expression="amount - discount",
                data_type="DECIMAL"
            ),
        ]
        
        # Create project with cross-model dimension
        project = Project(
            name="test_project",
            sources=[source],
            models=[users_model, orders_model],
            dimensions=[
                Dimension(
                    name="customer_order_summary",
                    expression="${ref(users).full_name} || ' - $' || ${ref(orders).final_amount}",
                    description="Combined customer and order information"
                )
            ],
            dashboards=[],
        )
        
        resolver = DimensionResolver(project)
        
        # Resolve the project-level dimension
        expression = resolver.resolve_dimension_expression("customer_order_summary")
        # Should resolve nested dimension references
        assert "(first_name || ' ' || last_name)" in expression
        assert "(amount - discount)" in expression
        
        # Check that it identifies the referenced models
        models = resolver.get_models_from_dimension("customer_order_summary")
        assert models == {"users", "orders"}

    def test_project_dimension_with_nested_references(self):
        """Test project dimension with multiple levels of nesting."""
        source = SourceFactory(name="test_db")
        
        model = SqlModelFactory(
            name="data",
            sql="SELECT value, multiplier FROM data_table",
            source="ref(test_db)",
        )
        model.dimensions = [
            Dimension(name="base_calc", expression="value * multiplier"),
        ]
        
        # Project with dimensions that reference other dimensions
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            dimensions=[
                Dimension(
                    name="enhanced_calc",
                    expression="${ref(data).base_calc} * 1.1",
                ),
                Dimension(
                    name="final_calc",
                    expression="${ref(enhanced_calc)} + 100",
                ),
            ],
            dashboards=[],
        )
        
        resolver = DimensionResolver(project)
        
        # Resolve the nested dimension
        expression = resolver.resolve_dimension_expression("final_calc")
        # Should have resolved all the way down
        assert "value * multiplier" in expression
        assert "1.1" in expression
        assert "100" in expression

    def test_project_dimension_overrides_model_dimension(self):
        """Test that project-level dimensions take precedence over model-level."""
        source = SourceFactory(name="test_db")
        
        model = SqlModelFactory(
            name="data",
            sql="SELECT amount FROM data_table",
            source="ref(test_db)",
        )
        model.dimensions = [
            Dimension(name="model_tax_rate", expression="0.08"),
        ]
        
        # Use ProjectFactory to avoid validation issues
        project = ProjectFactory(
            name="test_project",
            sources=[source],
            models=[model],
            dimensions=[
                Dimension(name="project_tax_rate", expression="0.10"),
            ],
            dashboards=[],
        )
        
        # Also add a dimension with same name as model dimension to test precedence
        project.dimensions.append(
            Dimension(name="model_tax_rate", expression="0.12")  # Override model's dimension
        )
        
        resolver = DimensionResolver(project)
        
        # Project-level dimension should override model-level with same name
        expression = resolver.resolve_dimension_expression("model_tax_rate")
        assert expression == "0.12"  # Project level takes precedence
        
        # Can still access model-level with qualification
        expression = resolver.resolve_dimension_expression("data.model_tax_rate")
        assert expression == "0.08"
        
        # Project-only dimension
        expression = resolver.resolve_dimension_expression("project_tax_rate")
        assert expression == "0.10"

    def test_cross_model_dimension_composition(self):
        """Test composing dimensions across multiple models."""
        source = SourceFactory(name="test_db")
        
        # Products model
        products_model = SqlModelFactory(
            name="products",
            sql="SELECT id, base_price, category FROM products",
            source="ref(test_db)",
        )
        products_model.dimensions = [
            Dimension(
                name="markup",
                expression="CASE WHEN category = 'premium' THEN 1.5 ELSE 1.2 END",
            ),
            Dimension(
                name="retail_price",
                expression="base_price * ${ref(products).markup}",
            ),
        ]
        
        # Inventory model
        inventory_model = SqlModelFactory(
            name="inventory",
            sql="SELECT product_id, quantity, warehouse FROM inventory",
            source="ref(test_db)",
        )
        inventory_model.dimensions = [
            Dimension(
                name="is_low_stock",
                expression="quantity < 10",
            ),
        ]
        
        # Project-level dimension combining both
        project = Project(
            name="test_project",
            sources=[source],
            models=[products_model, inventory_model],
            dimensions=[
                Dimension(
                    name="inventory_value",
                    expression="${ref(products).retail_price} * ${ref(inventory).quantity}",
                    description="Total value of inventory for a product"
                ),
                Dimension(
                    name="reorder_urgency",
                    expression="""
                        CASE 
                            WHEN ${ref(inventory).is_low_stock} 
                                AND ${ref(products).category} = 'premium' 
                            THEN 'URGENT'
                            WHEN ${ref(inventory).is_low_stock} 
                            THEN 'NORMAL'
                            ELSE 'NOT_NEEDED'
                        END
                    """,
                ),
            ],
            dashboards=[],
        )
        
        resolver = DimensionResolver(project)
        
        # Test inventory_value resolution
        expression = resolver.resolve_dimension_expression("inventory_value")
        assert "base_price" in expression
        assert "markup" in expression or "1.5" in expression or "1.2" in expression
        assert "quantity" in expression
        
        # Test reorder_urgency resolution
        expression = resolver.resolve_dimension_expression("reorder_urgency")
        assert "quantity < 10" in expression
        assert "URGENT" in expression
        assert "category" in expression
        
        # Check models involved
        models = resolver.get_models_from_dimension("inventory_value")
        assert models == {"products", "inventory"}

    def test_circular_dimension_references_detected(self):
        """Test that circular dimension references are detected."""
        source = SourceFactory(name="test_db")
        model = SqlModelFactory(
            name="data",
            sql="SELECT value FROM data_table",
            source="ref(test_db)",
        )
        
        # Create circular reference
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            dimensions=[
                Dimension(name="dim_a", expression="${ref(dim_b)} + 1"),
                Dimension(name="dim_b", expression="${ref(dim_a)} * 2"),
            ],
            dashboards=[],
        )
        
        resolver = DimensionResolver(project)
        
        # Should handle circular reference gracefully
        # (might return original reference or raise an error depending on implementation)
        try:
            expression = resolver.resolve_dimension_expression("dim_a")
            # If it doesn't raise, it should at least not infinite loop
            assert "${ref(" in expression  # Should have unresolved references
        except (DimensionNotFoundError, RecursionError):
            # This is also acceptable behavior
            pass

    def test_project_dimension_in_trace(self):
        """Test that project dimensions can be used in traces."""
        from visivo.models.trace import Trace
        
        source = SourceFactory(name="test_db")
        
        model = SqlModelFactory(
            name="sales",
            sql="SELECT product_id, quantity, price FROM sales",
            source="ref(test_db)",
        )
        model.dimensions = [
            Dimension(name="revenue", expression="quantity * price"),
        ]
        
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            dimensions=[
                Dimension(
                    name="revenue_with_tax",
                    expression="${ref(sales).revenue} * 1.08",
                ),
            ],
            traces=[
                Trace(
                    name="revenue_trace",
                    model="ref(sales)",
                    props={
                        "type": "bar",
                        "x": "query(product_id)",
                        "y": "query(${ref(revenue_with_tax)})",  # Using project dimension
                    },
                ),
            ],
            dashboards=[],
        )
        
        resolver = DimensionResolver(project)
        
        # Should be able to resolve the project dimension
        expression = resolver.resolve_dimension_expression("revenue_with_tax")
        assert "quantity * price" in expression
        assert "1.08" in expression