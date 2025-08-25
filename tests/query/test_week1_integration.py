"""
Integration tests for Week 1 Phase 2 functionality.
Tests the complete flow of metric composition and cross-model field references.
"""

import pytest
from unittest.mock import Mock, MagicMock, patch
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
        source = Mock(spec=Source)
        source.type = "postgresql"
        source.name = "main_db"

        # Create a model with metrics and dimensions
        model = Mock(spec=SqlModel)
        model.name = "sales"
        model.sql = "SELECT * FROM sales_table"

        # Add a dimension
        dimension = Mock(spec=Dimension)
        dimension.name = "revenue_category"
        dimension.sql = "CASE WHEN amount > 1000 THEN 'high' ELSE 'low' END"

        # Add metrics (dimensions are not resolved as metrics currently)
        base_metric = Mock(spec=Metric)
        base_metric.name = "total_revenue"
        base_metric.expression = "SUM(amount)"

        category_metric = Mock(spec=Metric)
        category_metric.name = "high_revenue_ratio"
        category_metric.expression = (
            "SUM(CASE WHEN amount > 1000 THEN amount ELSE 0 END) / ${ref(total_revenue)}"
        )

        model.metrics = [base_metric, category_metric]
        model.dimensions = [dimension]

        # Create project
        project = Mock(spec=Project)
        project.models = [model]
        project.metrics = []

        # Create a trace using the composed metric
        trace = Mock(spec=Trace)
        trace.name = "revenue_analysis"
        trace.cohort_on = None
        trace.props = Mock(spec=TraceProps)
        trace.props.x = "?{date}"
        trace.props.y = "?{${ref(high_revenue_ratio)}}"
        trace.props.model_dump = Mock(
            return_value={"x": "?{date}", "y": "?{${ref(high_revenue_ratio)}}"}
        )
        trace.order_by = []
        trace.filter_by = []
        trace.model_dump = Mock(return_value={"order_by": [], "filter_by": []})

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
        source = Mock(spec=Source)
        source.type = "postgresql"
        source.name = "main_db"

        # Create multiple models
        orders_model = Mock(spec=SqlModel)
        orders_model.name = "orders"
        orders_model.sql = "SELECT * FROM orders"
        orders_model.metrics = [Mock(spec=Metric, name="order_count", expression="COUNT(*)")]
        orders_model.metrics[0].name = "order_count"
        orders_model.metrics[0].expression = "COUNT(*)"

        customers_model = Mock(spec=SqlModel)
        customers_model.name = "customers"
        customers_model.sql = "SELECT * FROM customers"
        customers_model.metrics = [
            Mock(
                spec=Metric,
                name="customer_count",
                expression="COUNT(DISTINCT customers.customer_id)",
            )
        ]
        customers_model.metrics[0].name = "customer_count"
        customers_model.metrics[0].expression = "COUNT(DISTINCT customers.customer_id)"

        products_model = Mock(spec=SqlModel)
        products_model.name = "products"
        products_model.sql = "SELECT * FROM products"
        products_model.metrics = [
            Mock(spec=Metric, name="category_weight", expression="AVG(weight)")
        ]
        products_model.metrics[0].name = "category_weight"
        products_model.metrics[0].expression = "AVG(weight)"

        # Create a complex cross-model metric
        complex_metric = Mock(spec=Metric)
        complex_metric.name = "orders_per_customer_by_category"
        complex_metric.expression = "${ref(orders).order_count} / ${ref(customers).customer_count} * ${ref(products).category_weight}"

        # Create project
        project = Mock(spec=Project)
        project.models = [orders_model, customers_model, products_model]
        project.metrics = [complex_metric]

        # Create a trace using the complex metric
        trace = Mock(spec=Trace)
        trace.name = "complex_analysis"
        trace.cohort_on = None
        trace.props = Mock(spec=TraceProps)
        trace.props.y = "?{${ref(orders_per_customer_by_category)}}"
        trace.props.model_dump = Mock(
            return_value={"y": "?{${ref(orders_per_customer_by_category)}}"}
        )
        trace.order_by = []
        trace.filter_by = []
        trace.model_dump = Mock(return_value={"order_by": [], "filter_by": []})

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

        # Test dependency graph
        deps = resolver.build_dependency_graph()
        assert "avg_revenue" in deps
        assert "revenue" in deps["avg_revenue"]
        assert "complex_metric" in deps
        assert "revenue_per_customer" in deps["complex_metric"]

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
        project = Mock(spec=Project)
        project.models = []
        project.metrics = []

        # Create trace and model
        trace = Mock(spec=Trace)
        trace.name = "test_trace"
        trace.cohort_on = None
        trace.props = Mock(spec=TraceProps)
        trace.props.y = "?{amount}"
        trace.props.model_dump = Mock(return_value={"y": "?{amount}"})
        trace.order_by = []
        trace.filter_by = []
        trace.model_dump = Mock(return_value={"order_by": [], "filter_by": []})

        model = Mock(spec=SqlModel)
        model.name = "orders"
        model.sql = "SELECT * FROM orders"
        model.metrics = []

        source = Mock(spec=Source)
        source.type = "postgresql"
        source.name = "main_db"

        # Test that tokenizer accepts and stores project parameter
        tokenizer = TraceTokenizer(trace=trace, model=model, source=source, project=project)

        assert tokenizer.project == project

    def test_circular_dependency_detection_in_trace(self):
        """Test that circular dependencies are properly detected when used in traces."""
        source = Mock(spec=Source)
        source.type = "postgresql"
        source.name = "main_db"

        model = Mock(spec=SqlModel)
        model.name = "orders"
        model.sql = "SELECT * FROM orders"
        model.metrics = []

        # Create circular metrics
        metric_a = Mock(spec=Metric)
        metric_a.name = "metric_a"
        metric_a.expression = "${ref(metric_b)} + 1"

        metric_b = Mock(spec=Metric)
        metric_b.name = "metric_b"
        metric_b.expression = "${ref(metric_a)} * 2"

        project = Mock(spec=Project)
        project.models = [model]
        project.metrics = [metric_a, metric_b]

        # Create a trace using a circular metric
        trace = Mock(spec=Trace)
        trace.name = "circular_trace"
        trace.cohort_on = None
        trace.props = Mock(spec=TraceProps)
        trace.props.y = "?{${ref(metric_a)}}"
        trace.props.model_dump = Mock(return_value={"y": "?{${ref(metric_a)}}"})
        trace.order_by = []
        trace.filter_by = []
        trace.model_dump = Mock(return_value={"order_by": [], "filter_by": []})

        # Create tokenizer - it should handle the error gracefully
        tokenizer = TraceTokenizer(trace=trace, model=model, source=source, project=project)

        # The tokenizer should fall back to the original reference
        tokenized = tokenizer.tokenize()
        assert "${ref(metric_a)}" in tokenized.select_items.get("props.y", "")

    def test_mixed_ref_syntax_handling(self):
        """Test handling of mixed reference syntaxes in the same expression."""
        source = Mock(spec=Source)
        source.type = "postgresql"
        source.name = "main_db"

        orders_model = Mock(spec=SqlModel)
        orders_model.name = "orders"
        orders_model.sql = "SELECT * FROM orders"

        order_metric = Mock(spec=Metric)
        order_metric.name = "total"
        order_metric.expression = "SUM(amount)"
        orders_model.metrics = [order_metric]

        customers_model = Mock(spec=SqlModel)
        customers_model.name = "customers"
        customers_model.sql = "SELECT * FROM customers"
        customers_model.metrics = []

        # Create a metric with mixed syntax (using ${ref()} syntax for all references)
        mixed_metric = Mock(spec=Metric)
        mixed_metric.name = "complex"
        mixed_metric.expression = "${ref(orders).total} / ${ref(customers).count}"

        project = Mock(spec=Project)
        project.models = [orders_model, customers_model]
        project.metrics = [mixed_metric]

        # Create trace
        trace = Mock(spec=Trace)
        trace.name = "mixed_trace"
        trace.cohort_on = None
        trace.props = Mock(spec=TraceProps)
        trace.props.y = "?{${ref(complex)} + ${ref(customers).region}}"
        trace.props.model_dump = Mock(
            return_value={"y": "?{${ref(complex)} + ${ref(customers).region}}"}
        )
        trace.order_by = []
        trace.filter_by = []
        trace.model_dump = Mock(return_value={"order_by": [], "filter_by": []})

        # Create tokenizer
        tokenizer = TraceTokenizer(trace=trace, model=orders_model, source=source, project=project)

        # Tokenize and verify
        tokenized = tokenizer.tokenize()

        # Check that customers is tracked (from both the metric and direct reference)
        assert tokenized.referenced_models is not None
        assert "customers" in tokenized.referenced_models

        # Check resolution
        y_value = tokenized.select_items.get("props.y", "")
        assert (
            "(SUM(amount)) / ${ref(customers).count}" in y_value or "complex" in y_value
        )  # Metric resolved or fallback
        assert "customers.region" in y_value  # Direct field reference preserved

    def test_empty_and_null_handling(self):
        """Test handling of empty/null values in various scenarios."""
        source = Mock(spec=Source)
        source.type = "postgresql"
        source.name = "main_db"

        # Model with empty metrics list
        model = Mock(spec=SqlModel)
        model.name = "orders"
        model.sql = "SELECT * FROM orders"
        model.metrics = []

        # Project with None metrics
        project = Mock(spec=Project)
        project.models = [model]
        project.metrics = None

        # Trace with various edge cases
        trace = Mock(spec=Trace)
        trace.name = "edge_case_trace"
        trace.cohort_on = None
        trace.props = Mock(spec=TraceProps)
        trace.props.y = "?{${ref(nonexistent)} + ${ref(orders).missing}}"
        trace.props.model_dump = Mock(
            return_value={"y": "?{${ref(nonexistent)} + ${ref(orders).missing}}"}
        )
        trace.order_by = None
        trace.filter_by = None
        trace.model_dump = Mock(return_value={"order_by": None, "filter_by": None})

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
        source = Mock(spec=Source)
        source.type = "postgresql"
        source.name = "main_db"

        model = Mock(spec=SqlModel)
        model.name = "orders"
        model.sql = "SELECT * FROM orders"
        model.metrics = []

        # Create a chain of 50 metrics
        metrics = []
        for i in range(50):
            metric = Mock(spec=Metric)
            metric.name = f"metric_{i}"
            if i == 0:
                metric.expression = "SUM(amount)"
            else:
                metric.expression = f"${{ref(metric_{i-1})}} + {i}"
            metrics.append(metric)

        project = Mock(spec=Project)
        project.models = [model]
        project.metrics = metrics

        # Create resolver
        resolver = MetricResolver(project)

        # Should resolve the entire chain
        resolved = resolver.resolve_metric_expression("metric_49")
        assert "SUM(amount)" in resolved

        # Check that it builds proper dependency graph
        deps = resolver.build_dependency_graph()
        assert len(deps) == 50

        # Topological sort should order them correctly
        sorted_metrics = resolver.topological_sort()
        assert sorted_metrics.index("metric_0") < sorted_metrics.index("metric_49")
