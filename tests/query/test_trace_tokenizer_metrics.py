"""Tests for metric resolution in TraceTokenizer."""

import pytest
from visivo.query.trace_tokenizer import TraceTokenizer
from visivo.models.trace import Trace
from visivo.models.models.sql_model import SqlModel
from visivo.models.sources.sqlite_source import SqliteSource
from visivo.models.metric import Metric
from visivo.models.trace_columns import TraceColumns


class TestTraceTokenizerMetrics:
    """Test suite for metric resolution in TraceTokenizer."""

    def test_resolve_simple_metric_reference(self):
        """Test resolving a simple metric reference in a trace."""
        # Create a source
        source = SqliteSource(name="test_source", type="sqlite", database=":memory:")

        # Create a model with metrics
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=source,
            metrics=[
                Metric(name="total_revenue", expression="SUM(amount)"),
                Metric(name="order_count", expression="COUNT(*)"),
            ],
        )

        # Create a trace that references a metric directly in props
        trace = Trace(
            name="revenue_trace",
            model=model,
            props={
                "type": "scatter",
                "x": "?{ date }",
                "y": "?{ ${ref(orders).total_revenue} }",
            },
        )

        # Tokenize the trace
        tokenizer = TraceTokenizer(trace=trace, model=model, source=source)

        # Check that the metric reference was resolved
        assert "props.y" in tokenizer.select_items
        assert tokenizer.select_items["props.y"] == "(SUM(amount))"

    def test_resolve_multiple_metric_references(self):
        """Test resolving multiple metric references in a trace."""
        source = SqliteSource(name="test_source", type="sqlite", database=":memory:")

        model = SqlModel(
            name="sales",
            sql="SELECT * FROM sales_table",
            source=source,
            metrics=[
                Metric(name="total_sales", expression="SUM(amount)"),
                Metric(name="avg_sale", expression="AVG(amount)"),
                Metric(name="sale_count", expression="COUNT(DISTINCT order_id)"),
            ],
        )

        trace = Trace(
            name="sales_analysis",
            model=model,
            props={
                "type": "bar",
                "x": "?{ region }",
                "y": "?{ ${ref(sales).total_sales} }",
                "text": "?{ ${ref(sales).avg_sale} }",
                "customdata": ["?{ ${ref(sales).sale_count} }"],
            },
        )

        tokenizer = TraceTokenizer(trace=trace, model=model, source=source)

        # Check all metric references were resolved
        assert tokenizer.select_items["props.y"] == "(SUM(amount))"
        assert tokenizer.select_items["props.text"] == "(AVG(amount))"
        assert tokenizer.select_items["props.customdata.0"] == "(COUNT(DISTINCT order_id))"

    def test_metric_in_filter(self):
        """Test resolving metric references in filters."""
        source = SqliteSource(name="test_source", type="sqlite", database=":memory:")

        model = SqlModel(
            name="products",
            sql="SELECT * FROM products_table",
            source=source,
            metrics=[
                Metric(name="total_quantity", expression="SUM(quantity)"),
            ],
        )

        trace = Trace(
            name="product_trace",
            model=model,
            props={
                "type": "scatter",
                "x": "?{ product_name }",
                "y": "?{ price }",
            },
            filters=["?{ ${ref(products).total_quantity} > 100 }"],
        )

        tokenizer = TraceTokenizer(trace=trace, model=model, source=source)

        # Check that the metric in the filter was resolved
        assert hasattr(tokenizer, "filter_by")
        # The resolved filter should contain the expanded metric
        all_filters = (
            tokenizer.filter_by.get("aggregate", [])
            + tokenizer.filter_by.get("vanilla", [])
            + tokenizer.filter_by.get("window", [])
        )
        assert any("(SUM(quantity)) > 100" in f for f in all_filters)

    def test_metric_in_order_by(self):
        """Test resolving metric references in order_by."""
        source = SqliteSource(name="test_source", type="sqlite", database=":memory:")

        model = SqlModel(
            name="customers",
            sql="SELECT * FROM customers_table",
            source=source,
            metrics=[
                Metric(name="lifetime_value", expression="SUM(total_spent)"),
            ],
        )

        trace = Trace(
            name="customer_trace",
            model=model,
            props={
                "type": "bar",
                "x": "?{ customer_name }",
                "y": "?{ ${ref(customers).lifetime_value} }",
            },
            order_by=["?{ ${ref(customers).lifetime_value} DESC }"],
        )

        tokenizer = TraceTokenizer(trace=trace, model=model, source=source)

        # Check that the metric in order_by was resolved
        assert hasattr(tokenizer, "order_by")
        assert len(tokenizer.order_by) == 1
        assert tokenizer.order_by[0] == "(SUM(total_spent)) DESC"

    def test_nonexistent_metric_reference(self):
        """Test that non-existent metric references are left unchanged."""
        source = SqliteSource(name="test_source", type="sqlite", database=":memory:")

        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders_table",
            source=source,
            metrics=[
                Metric(name="total_revenue", expression="SUM(amount)"),
            ],
        )

        trace = Trace(
            name="bad_trace",
            model=model,
            props={
                "type": "scatter",
                "x": "?{ date }",
                "y": "?{ ${ref(orders).nonexistent_metric} }",
            },
        )

        tokenizer = TraceTokenizer(trace=trace, model=model, source=source)

        # Non-existent metric reference should be left unchanged
        assert tokenizer.select_items["props.y"] == "${ref(orders).nonexistent_metric}"

    def test_complex_metric_expression(self):
        """Test resolving complex metric expressions."""
        source = SqliteSource(name="test_source", type="sqlite", database=":memory:")

        model = SqlModel(
            name="analytics",
            sql="SELECT * FROM analytics_table",
            source=source,
            metrics=[
                Metric(
                    name="conversion_rate",
                    expression="COUNT(DISTINCT CASE WHEN converted THEN user_id END) * 100.0 / COUNT(DISTINCT user_id)",
                ),
            ],
        )

        trace = Trace(
            name="conversion_trace",
            model=model,
            props={
                "type": "indicator",
                "value": "?{ ${ref(analytics).conversion_rate} }",
            },
        )

        tokenizer = TraceTokenizer(trace=trace, model=model, source=source)

        # Complex metric should be wrapped in parentheses
        expected = "(COUNT(DISTINCT CASE WHEN converted THEN user_id END) * 100.0 / COUNT(DISTINCT user_id))"
        assert tokenizer.select_items["props.value"] == expected
