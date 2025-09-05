"""
Tests for metric resolution during validation.
This tests the fix for resolving ${ref()} syntax before validation.
"""

import pytest
from visivo.models.project import Project
from visivo.models.models.sql_model import SqlModel
from visivo.models.sources.sqlite_source import SqliteSource
from visivo.models.metric import Metric
from visivo.query.metric_resolver import MetricResolver
from visivo.validation.metric_validator import MetricValidator


class TestMetricValidationResolution:
    """Test that metrics are properly resolved before validation."""

    def test_project_metric_referencing_model_metrics(self):
        """Test a project-level metric that references model-scoped metrics."""
        # Create a source
        source = SqliteSource(name="test_source", type="sqlite", database=":memory:")

        # Create a model with metrics
        model = SqlModel(
            name="test_table",
            sql="SELECT * FROM test_table",
            source="ref(test_source)",
            metrics=[
                Metric(name="min_y", expression="MIN(y)"),
                Metric(name="total_y", expression="SUM(y)"),
            ],
        )

        # Create a project with a metric that references the model metrics
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            metrics=[Metric(name="test_ratio", expression="${ref(min_y)} / ${ref(total_y)}")],
        )

        # Initialize the resolver
        resolver = MetricResolver(project)

        # Resolve the metric for validation
        resolved_expr, involved_models = resolver.resolve_metric_for_validation("test_ratio")

        # Should resolve to pure SQL
        assert resolved_expr == "(MIN(y)) / (SUM(y))"
        assert "test_table" in involved_models

        # Validate the resolved expression should pass
        is_valid, error = MetricValidator.validate_aggregate_expression(resolved_expr)
        assert is_valid, f"Validation failed: {error}"

    def test_nested_metric_composition(self):
        """Test resolving nested metric compositions."""
        source = SqliteSource(name="test_source", type="sqlite", database=":memory:")

        model = SqlModel(name="sales", sql="SELECT * FROM sales", source="ref(test_source)")

        # Create metrics with nested dependencies
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            metrics=[
                Metric(name="revenue", expression="SUM(amount)"),
                Metric(name="costs", expression="SUM(cost)"),
                Metric(name="profit", expression="${ref(revenue)} - ${ref(costs)}"),
                Metric(name="profit_margin", expression="${ref(profit)} / ${ref(revenue)} * 100"),
            ],
        )

        resolver = MetricResolver(project)

        # Resolve the deeply nested metric
        resolved_expr, involved_models = resolver.resolve_metric_for_validation("profit_margin")

        # Should resolve to pure SQL
        assert resolved_expr == "((SUM(amount)) - (SUM(cost))) / (SUM(amount)) * 100"

        # Validate should pass
        is_valid, error = MetricValidator.validate_aggregate_expression(resolved_expr)
        assert is_valid, f"Validation failed: {error}"

    def test_metric_not_found_error(self):
        """Test that non-existent metric references produce clear error messages."""
        source = SqliteSource(name="test_source", type="sqlite", database=":memory:")

        # Create models with different metric names
        model1 = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source="ref(test_source)",
            metrics=[Metric(name="order_total", expression="SUM(amount)")],
        )

        model2 = SqlModel(
            name="products",
            sql="SELECT * FROM products",
            source="ref(test_source)",
            metrics=[Metric(name="product_count", expression="COUNT(*)")],
        )

        # Create a project metric referencing a non-existent metric
        project = Project(
            name="test_project",
            sources=[source],
            models=[model1, model2],
            metrics=[Metric(name="missing_metric", expression="${ref(non_existent)} * 2")],
        )

        resolver = MetricResolver(project)

        # Try to resolve - it should leave the reference as-is if metric not found
        # (or could raise an error - depends on implementation)
        try:
            resolved_expr, involved_models = resolver.resolve_metric_for_validation(
                "missing_metric"
            )
            # If it doesn't raise, check that the reference wasn't resolved
            assert "${ref(non_existent)}" in resolved_expr
        except Exception as e:
            # If it raises, check the error message
            error_msg = str(e)
            assert "not found" in error_msg.lower() or "cannot be found" in error_msg.lower()

    def test_qualified_metric_reference(self):
        """Test that qualified metric references work correctly."""
        source = SqliteSource(name="test_source", type="sqlite", database=":memory:")

        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source="ref(test_source)",
            metrics=[Metric(name="total_revenue", expression="SUM(revenue)")],
        )

        # Use qualified reference
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            metrics=[Metric(name="doubled_revenue", expression="${ref(orders).total_revenue} * 2")],
        )

        resolver = MetricResolver(project)

        resolved_expr, involved_models = resolver.resolve_metric_for_validation("doubled_revenue")

        assert resolved_expr == "(SUM(revenue)) * 2"
        assert "orders" in involved_models

        # Validate should pass
        is_valid, error = MetricValidator.validate_aggregate_expression(resolved_expr)
        assert is_valid, f"Validation failed: {error}"

    def test_same_model_metrics_no_join_required(self):
        """Test that metrics from the same model don't require joins."""
        source = SqliteSource(name="test_source", type="sqlite", database=":memory:")

        model = SqlModel(
            name="sales",
            sql="SELECT * FROM sales",
            source="ref(test_source)",
            metrics=[
                Metric(name="total_sales", expression="SUM(amount)"),
                Metric(name="total_quantity", expression="SUM(quantity)"),
            ],
        )

        # Metric using two metrics from same model
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            metrics=[
                Metric(name="avg_price", expression="${ref(total_sales)} / ${ref(total_quantity)}")
            ],
        )

        resolver = MetricResolver(project)

        resolved_expr, involved_models = resolver.resolve_metric_for_validation("avg_price")

        assert resolved_expr == "(SUM(amount)) / (SUM(quantity))"
        # Only one model involved
        assert len(involved_models) == 1
        assert "sales" in involved_models
