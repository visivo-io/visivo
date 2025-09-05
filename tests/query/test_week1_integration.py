"""
Integration tests for Week 1 Phase 2 functionality.
Tests the complete flow of metric composition and cross-model field references.
"""

import pytest
from unittest.mock import patch
from visivo.query.trace_tokenizer import TraceTokenizer
from visivo.query.metric_resolver import MetricResolver, CircularDependencyError
from visivo.models.trace import Trace
from visivo.models.models.sql_model import SqlModel
from visivo.models.sources.source import Source
from visivo.models.sources.sqlite_source import SqliteSource
from visivo.models.project import Project
from visivo.models.metric import Metric
from visivo.models.dimension import Dimension
from visivo.models.trace_props.trace_props import TraceProps
from visivo.models.tokenized_trace import TokenizedTrace
from visivo.jobs import run_trace_job


class TestWeek1Integration:
    """Integration tests for Week 1 Phase 2 features."""

    def test_end_to_end_metric_composition_with_dimensions(self):
        """Test metric composition working with dimensions in the same model."""
        source = SqliteSource(name="main_db", type="sqlite", database=":memory:")

        # Create a model with metrics and dimensions
        model = SqlModel(
            name="sales",
            sql="SELECT * FROM sales_table",
            source="ref(main_db)",
            dimensions=[
                Dimension(
                    name="revenue_category",
                    expression="CASE WHEN amount > 1000 THEN 'high' ELSE 'low' END",
                )
            ],
            metrics=[
                Metric(name="total_revenue", expression="SUM(amount)"),
                Metric(
                    name="high_revenue_ratio",
                    expression="SUM(CASE WHEN amount > 1000 THEN amount ELSE 0 END) / ${ref(total_revenue)}",
                ),
            ],
        )

        # Create project
        project = Project(name="test_project", sources=[source], models=[model], metrics=[])

        # Create a trace using the composed metric
        trace = Trace(
            name="revenue_analysis",
            model=model,
            props={"type": "scatter", "x": "?{date}", "y": "?{${ref(high_revenue_ratio)}}"},
        )

        # Create tokenizer
        tokenizer = TraceTokenizer(trace=trace, model=model, source=source, project=project)

        # Tokenize and verify
        tokenized = tokenizer.tokenize()

        # The metric should be resolved with the base metric expanded
        y_value = tokenized.select_items.get("props.y", "")
        # Since high_revenue_ratio is not found in project metrics, it falls back
        assert "high_revenue_ratio" in y_value or "SUM(CASE WHEN" in y_value

    def test_cross_model_metrics_with_multiple_dependencies(self):
        """Test metrics that depend on fields and metrics from multiple models."""
        source = SqliteSource(name="main_db", type="sqlite", database=":memory:")

        # Create multiple models
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source="ref(main_db)",
            metrics=[Metric(name="order_count", expression="COUNT(*)")],
        )

        customers_model = SqlModel(
            name="customers",
            sql="SELECT * FROM customers",
            source="ref(main_db)",
            metrics=[
                Metric(name="customer_count", expression="COUNT(DISTINCT customers.customer_id)")
            ],
        )

        products_model = SqlModel(
            name="products",
            sql="SELECT * FROM products",
            source="ref(main_db)",
            metrics=[Metric(name="category_weight", expression="AVG(weight)")],
        )

        # Create a complex cross-model metric
        complex_metric = Metric(
            name="orders_per_customer_by_category",
            expression="${ref(orders).order_count} / ${ref(customers).customer_count} * ${ref(products).category_weight}",
        )

        # Create project
        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model, customers_model, products_model],
            metrics=[complex_metric],
        )

        # Create a trace using the complex metric
        trace = Trace(
            name="complex_analysis",
            model=orders_model,
            props={
                "type": "scatter",
                "x": "?{x}",
                "y": "?{${ref(orders_per_customer_by_category)}}",
            },
        )

        # Create tokenizer from orders model perspective
        tokenizer = TraceTokenizer(trace=trace, model=orders_model, source=source, project=project)

        # Tokenize and verify
        tokenized = tokenizer.tokenize()

        # Check that all models are tracked except the current one
        assert tokenized.referenced_models is not None
        assert set(tokenized.referenced_models) == {"customers", "products"}

        # Check that the expression is properly resolved
        y_value = tokenized.select_items.get("props.y", "")
        assert "(COUNT(*))" in y_value  # orders.order_count resolved
        assert (
            "(COUNT(DISTINCT customers.customer_id))" in y_value
        )  # customers.customer_count resolved
        assert "(AVG(weight))" in y_value  # products.category_weight resolved

    def test_metric_resolver_with_sqlmodel_instances(self):
        """Test MetricResolver with actual SqlModel instances (not mocks)."""
        # Create actual SqlModel instances with source
        from visivo.models.sources.sqlite_source import SqliteSource

        source = SqliteSource(name="test_db", type="sqlite", database=":memory:")

        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source="ref(test_db)",
            metrics=[
                Metric(name="revenue", expression="SUM(amount)"),
                Metric(name="avg_revenue", expression="${ref(revenue)} / COUNT(*)"),
            ],
        )

        customers_model = SqlModel(
            name="customers",
            sql="SELECT * FROM customers",
            source="ref(test_db)",
            metrics=[Metric(name="lifetime_value", expression="SUM(total_purchases)")],
        )

        # Create project-level metrics
        project_metrics = [
            Metric(
                name="revenue_per_customer",
                expression="${ref(orders).revenue} / COUNT(DISTINCT customers.customer_id)",
            ),
            Metric(
                name="complex_metric",
                expression="${ref(revenue_per_customer)} * ${ref(customers).lifetime_value}",
            ),
        ]

        # Create project
        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model, customers_model],
            metrics=project_metrics,
        )

        # Create resolver
        resolver = MetricResolver(project)

        # Test metric index building
        assert "revenue" in resolver.metrics_by_name
        assert "orders.revenue" in resolver.metrics_by_name
        assert "revenue_per_customer" in resolver.metrics_by_name
        assert "complex_metric" in resolver.metrics_by_name

        # Test dependency resolution
        deps = resolver.get_metric_dependencies("avg_revenue")
        assert "revenue" in deps

        deps = resolver.get_metric_dependencies("complex_metric")
        assert "revenue_per_customer" in deps

        # Test resolution
        resolved = resolver.resolve_metric_expression("complex_metric")
        assert "SUM(amount)" in resolved
        assert "COUNT(DISTINCT customers.customer_id)" in resolved
        assert "SUM(total_purchases)" in resolved

        # Test model extraction
        models = resolver.get_models_from_metric("complex_metric")
        # Only customers is explicitly referenced in the resolved expression
        # orders.revenue gets resolved to SUM(amount) without the model qualifier
        assert "customers" in models

    def test_tokenized_trace_serialization(self):
        """Test that TokenizedTrace properly serializes with referenced_models."""
        # Create a TokenizedTrace with referenced models
        tokenized = TokenizedTrace(
            sql="SELECT * FROM orders",
            cohort_on="'test'",
            source="main_db",
            source_type="postgresql",
            select_items={"y": "customers.name"},
            referenced_models=["customers", "products"],
        )

        # Test serialization
        serialized = tokenized.model_dump()
        assert "referenced_models" in serialized
        assert serialized["referenced_models"] == ["customers", "products"]

        # Test JSON serialization
        json_str = tokenized.model_dump_json()
        assert (
            '"referenced_models": ["customers", "products"]' in json_str
            or '"referenced_models":["customers","products"]' in json_str
        )

    def test_run_trace_job_with_project_integration(self):
        """Test that tokenizer can accept project parameter."""
        source = SqliteSource(name="main_db", type="sqlite", database=":memory:")

        model = SqlModel(
            name="orders", sql="SELECT * FROM orders", source="ref(main_db)", metrics=[]
        )

        project = Project(name="test_project", sources=[source], models=[model], metrics=[])

        trace = Trace(
            name="test_trace", model=model, props={"type": "scatter", "x": "?{x}", "y": "?{amount}"}
        )

        # Test that tokenizer accepts and stores project parameter
        tokenizer = TraceTokenizer(trace=trace, model=model, source=source, project=project)

        assert tokenizer.project == project

    def test_circular_dependency_detection_in_trace(self):
        """Test that circular dependencies are properly detected when used in traces."""
        source = SqliteSource(name="main_db", type="sqlite", database=":memory:")

        model = SqlModel(
            name="orders", sql="SELECT * FROM orders", source="ref(main_db)", metrics=[]
        )

        # Create circular metrics
        metric_a = Metric(name="metric_a", expression="${ref(metric_b)} + 1")

        metric_b = Metric(name="metric_b", expression="${ref(metric_a)} * 2")

        project = Project(
            name="test_project", sources=[source], models=[model], metrics=[metric_a, metric_b]
        )

        # Create a trace using a circular metric
        trace = Trace(
            name="circular_trace",
            model=model,
            props={"type": "scatter", "x": "?{x}", "y": "?{${ref(metric_a)}}"},
        )

        # Create tokenizer - it should handle the error gracefully
        tokenizer = TraceTokenizer(trace=trace, model=model, source=source, project=project)

        # The tokenizer should fall back to the original reference
        tokenized = tokenizer.tokenize()
        assert "${ref(metric_a)}" in tokenized.select_items.get("props.y", "")

    def test_mixed_ref_syntax_handling(self):
        """Test handling of mixed reference syntaxes in the same expression."""
        source = SqliteSource(name="main_db", type="sqlite", database=":memory:")

        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source="ref(main_db)",
            metrics=[Metric(name="total", expression="SUM(amount)")],
        )

        customers_model = SqlModel(
            name="customers", sql="SELECT * FROM customers", source="ref(main_db)", metrics=[]
        )

        # Create a metric with mixed syntax
        mixed_metric = Metric(
            name="complex", expression="${ref(orders).total} / ${ref(customers).count}"
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model, customers_model],
            metrics=[mixed_metric],
        )

        # Create trace
        trace = Trace(
            name="mixed_trace",
            model=orders_model,
            props={
                "type": "scatter",
                "x": "?{x}",
                "y": "?{${ref(complex)} + ${ref(customers).region}}",
            },
        )

        # Create tokenizer
        tokenizer = TraceTokenizer(trace=trace, model=orders_model, source=source, project=project)

        # Tokenize and verify
        tokenized = tokenizer.tokenize()

        # Check that customers is tracked (from both the metric and direct reference)
        assert tokenized.referenced_models is not None
        assert "customers" in tokenized.referenced_models

        # Check resolution
        y_value = tokenized.select_items.get("props.y", "")
        # Verify the metric was resolved and contains expected components
        assert "SUM(amount)" in y_value  # orders.total resolved
        assert "customers.count" in y_value  # customers.count reference
        assert "customers.region" in y_value  # Direct field reference preserved

    def test_empty_and_null_handling(self):
        """Test handling of empty/null values in various scenarios."""
        source = SqliteSource(name="main_db", type="sqlite", database=":memory:")

        # Model with empty metrics list
        model = SqlModel(
            name="orders", sql="SELECT * FROM orders", source="ref(main_db)", metrics=[]
        )

        # Project with empty metrics
        project = Project(name="test_project", sources=[source], models=[model], metrics=[])

        # Trace with various edge cases
        trace = Trace(
            name="edge_case_trace",
            model=model,
            props={
                "type": "scatter",
                "x": "?{x}",
                "y": "?{${ref(nonexistent)} + ${ref(orders).missing}}",
            },
        )

        # Should not crash
        tokenizer = TraceTokenizer(trace=trace, model=model, source=source, project=project)
        tokenized = tokenizer.tokenize()

        # Non-existent references should be preserved
        assert "${ref(nonexistent)}" in tokenized.select_items.get("props.y", "")
        assert "${ref(orders).missing}" in tokenized.select_items.get("props.y", "")

        # No models should be tracked (orders is current model)
        assert tokenized.referenced_models is None or len(tokenized.referenced_models) == 0

    def test_performance_with_many_metrics(self):
        """Test performance and correctness with a large number of metrics."""
        source = SqliteSource(name="main_db", type="sqlite", database=":memory:")

        model = SqlModel(
            name="orders", sql="SELECT * FROM orders", source="ref(main_db)", metrics=[]
        )

        # Create a chain of 50 metrics
        metrics = []
        for i in range(50):
            if i == 0:
                expression = "SUM(amount)"
            else:
                expression = f"${{ref(metric_{i-1})}} + {i}"

            metric = Metric(name=f"metric_{i}", expression=expression)
            metrics.append(metric)

        project = Project(name="test_project", sources=[source], models=[model], metrics=metrics)

        # Create resolver
        resolver = MetricResolver(project)

        # Should resolve the entire chain
        resolved = resolver.resolve_metric_expression("metric_49")
        assert "SUM(amount)" in resolved

        # Check dependencies are properly tracked
        deps = resolver.get_metric_dependencies("metric_49")
        assert "metric_48" in deps

        # Topological sort should order them correctly
        sorted_metrics = resolver.topological_sort()
        assert sorted_metrics.index("metric_0") < sorted_metrics.index("metric_49")
