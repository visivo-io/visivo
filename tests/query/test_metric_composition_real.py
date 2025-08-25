"""
Tests for metric composition in TraceTokenizer using real objects (not mocks).
"""

import pytest
from visivo.query.trace_tokenizer import TraceTokenizer
from visivo.models.trace import Trace
from visivo.models.models.sql_model import SqlModel
from visivo.models.sources.postgresql_source import PostgresqlSource
from visivo.models.project import Project
from visivo.models.metric import Metric
from visivo.models.trace_props.trace_props import TraceProps
from visivo.models.trace_columns import TraceColumns


class TestMetricCompositionReal:
    """Test suite for metric composition functionality in TraceTokenizer with real objects."""

    def test_simple_metric_composition(self):
        """Test resolving a simple metric that references another metric."""
        # Create real source
        source = PostgresqlSource(
            name="test_source",
            type="postgresql",
            database="test_db",
            host="localhost",
            username="test",
            password="test",
            port=5432,
        )

        # Create real model
        model = SqlModel(
            name="orders", sql="SELECT * FROM orders", source="ref(test_source)", metrics=[]
        )

        # Create base metrics
        base_metric = Metric(name="total_revenue", expression="SUM(amount)")

        # Create derived metric that references the base
        derived_metric = Metric(
            name="average_revenue",
            expression="${ref(total_revenue)} / COUNT(DISTINCT customer_id)",
        )

        # Create real project
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            metrics=[base_metric, derived_metric],
        )

        # Create real trace
        trace = Trace(
            name="revenue_trace",
            model="ref(orders)",
            columns=TraceColumns(y="?{${ref(average_revenue)}}"),
        )

        # Create tokenizer with project
        tokenizer = TraceTokenizer(trace=trace, model=model, source=source, project=project)

        # Check that the metric reference is resolved
        tokenized = tokenizer.tokenize()
        # The derived metric should resolve to: (SUM(amount)) / COUNT(DISTINCT customer_id)
        assert "columns.y" in tokenized.select_items
        assert "(SUM(amount))" in tokenized.select_items["columns.y"]
        assert "COUNT(DISTINCT customer_id)" in tokenized.select_items["columns.y"]

    def test_nested_metric_composition(self):
        """Test resolving nested metric compositions (A -> B -> C)."""
        # Create real source
        source = PostgresqlSource(
            name="test_source",
            type="postgresql",
            database="test_db",
            host="localhost",
            username="test",
            password="test",
            port=5432,
        )

        # Create real model
        model = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_source)")

        # Create metrics with dependencies
        metric_a = Metric(name="base_count", expression="COUNT(*)")
        metric_b = Metric(name="doubled_count", expression="${ref(base_count)} * 2")
        metric_c = Metric(name="final_metric", expression="${ref(doubled_count)} + 100")

        # Create real project
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            metrics=[metric_a, metric_b, metric_c],
        )

        # Create real trace
        trace = Trace(
            name="nested_trace",
            model="ref(orders)",
            columns=TraceColumns(x="?{date}", y="?{${ref(final_metric)}}"),
        )

        # Create tokenizer with project
        tokenizer = TraceTokenizer(trace=trace, model=model, source=source, project=project)

        # Check that the nested metric reference is fully resolved
        tokenized = tokenizer.tokenize()
        # Should resolve to: ((COUNT(*)) * 2) + 100
        y_value = tokenized.select_items.get("columns.y", "")
        assert "(COUNT(*))" in y_value
        assert "* 2" in y_value
        assert "+ 100" in y_value

    def test_multiple_metric_references(self):
        """Test resolving multiple metric references in a single expression."""
        # Create real source
        source = PostgresqlSource(
            name="test_source",
            type="postgresql",
            database="test_db",
            host="localhost",
            username="test",
            password="test",
            port=5432,
        )

        # Create real model
        model = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_source)")

        # Create base metrics
        metric1 = Metric(name="revenue", expression="SUM(revenue)")
        metric2 = Metric(name="costs", expression="SUM(costs)")

        # Create a derived metric that uses both
        profit_metric = Metric(name="profit", expression="${ref(revenue)} - ${ref(costs)}")

        # Create real project
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            metrics=[metric1, metric2, profit_metric],
        )

        # Create real trace
        trace = Trace(
            name="profit_margin_trace",
            model="ref(orders)",
            columns=TraceColumns(y="?{${ref(profit)} / ${ref(revenue)} * 100}"),
        )

        # Create tokenizer with project
        tokenizer = TraceTokenizer(trace=trace, model=model, source=source, project=project)

        # Check that all metric references are resolved
        tokenized = tokenizer.tokenize()
        y_value = tokenized.select_items.get("columns.y", "")
        # profit should resolve to ((SUM(revenue)) - (SUM(costs)))
        # revenue should resolve to (SUM(revenue))
        assert "SUM(revenue)" in y_value
        assert "SUM(costs)" in y_value
        assert "* 100" in y_value

    def test_metric_in_filter(self):
        """Test using composed metrics in filter expressions."""
        # Create real source
        source = PostgresqlSource(
            name="test_source",
            type="postgresql",
            database="test_db",
            host="localhost",
            username="test",
            password="test",
            port=5432,
        )

        # Create real model
        model = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_source)")

        # Create metrics
        base_metric = Metric(name="average_order_value", expression="AVG(order_value)")
        threshold_metric = Metric(
            name="high_value_threshold", expression="${ref(average_order_value)} * 2"
        )

        # Create real project
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            metrics=[base_metric, threshold_metric],
        )

        # Create real trace with filter
        trace = Trace(
            name="high_value_orders",
            model="ref(orders)",
            columns=TraceColumns(y="?{COUNT(*)}"),
            filters=["?{order_value > ${ref(high_value_threshold)}}"],
        )

        # Create tokenizer with project
        tokenizer = TraceTokenizer(trace=trace, model=model, source=source, project=project)

        # Check that the metric in filter is resolved
        tokenized = tokenizer.tokenize()
        # Filter should resolve to: order_value > ((AVG(order_value)) * 2)
        assert hasattr(tokenized, "filter_by") and tokenized.filter_by is not None
        # Check aggregate filters since it contains AVG
        filter_str = str(tokenized.filter_by.get("aggregate", []))
        assert "AVG(order_value)" in filter_str
        assert "* 2" in filter_str

    def test_backward_compatibility_model_metrics(self):
        """Test that model-level metrics still work."""
        # Create real source
        source = PostgresqlSource(
            name="test_source",
            type="postgresql",
            database="test_db",
            host="localhost",
            username="test",
            password="test",
            port=5432,
        )

        # Create model metric
        model_metric = Metric(name="total", expression="SUM(amount)")

        # Create real model with metric
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source="ref(test_source)",
            metrics=[model_metric],
        )

        # Create real project
        project = Project(name="test_project", sources=[source], models=[model])

        # Create real trace using model metric
        trace = Trace(
            name="backward_compat_trace",
            model="ref(orders)",
            columns=TraceColumns(y="?{${ref(orders).total}}"),
        )

        # Create tokenizer with project
        tokenizer = TraceTokenizer(trace=trace, model=model, source=source, project=project)

        # Should resolve model metrics
        tokenized = tokenizer.tokenize()
        assert "(SUM(amount))" in tokenized.select_items.get("columns.y", "")

    def test_circular_dependency_detection(self):
        """Test that circular dependencies in metrics are detected."""
        # Create real source
        source = PostgresqlSource(
            name="test_source",
            type="postgresql",
            database="test_db",
            host="localhost",
            username="test",
            password="test",
            port=5432,
        )

        # Create real model
        model = SqlModel(name="orders", sql="SELECT * FROM orders", source="ref(test_source)")

        # Create metrics with circular dependency
        metric_a = Metric(name="metric_a", expression="${ref(metric_b)}")
        metric_b = Metric(name="metric_b", expression="${ref(metric_a)}")

        # Create real project - metrics with circular refs are allowed at creation
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            metrics=[metric_a, metric_b],
        )

        # Create real trace using circular metric
        trace = Trace(
            name="circular_trace",
            model="ref(orders)",
            columns=TraceColumns(y="?{${ref(metric_a)}}"),
        )

        # Circular dependency should be detected during tokenization/resolution
        tokenizer = TraceTokenizer(trace=trace, model=model, source=source, project=project)

        # The circular reference should not be resolved
        tokenized = tokenizer.tokenize()
        # The metric reference should remain unresolved due to circular dependency
        assert "${ref(metric_a)}" in tokenized.select_items.get(
            "columns.y", ""
        ) or "${ref(metric_b)}" in tokenized.select_items.get("columns.y", "")
