"""
Tests for extracting model references from resolved metrics using DAG.
"""

import pytest
from unittest.mock import Mock
from visivo.query.trace_tokenizer import TraceTokenizer
from visivo.query.metric_resolver import MetricResolver
from visivo.models.trace import Trace
from visivo.models.models.sql_model import SqlModel
from visivo.models.sources.source import Source
from visivo.models.project import Project
from visivo.models.metric import Metric
from visivo.models.trace_props.trace_props import TraceProps


class TestModelsFromMetrics:
    """Test suite for extracting model references from metrics using DAG."""

    def test_metric_with_cross_model_references(self):
        """Test that models are extracted from metrics that reference multiple models."""
        # Create mock source
        source = Mock(spec=Source)
        source.type = "postgresql"
        source.name = "test_source"

        # Create models
        orders_model = Mock(spec=SqlModel)
        orders_model.name = "orders"
        orders_model.sql = "SELECT * FROM orders"
        orders_model.metrics = [Mock(spec=Metric, name="revenue", expression="SUM(amount)")]
        orders_model.metrics[0].name = "revenue"
        orders_model.metrics[0].expression = "SUM(amount)"

        customers_model = Mock(spec=SqlModel)
        customers_model.name = "customers"
        customers_model.sql = "SELECT * FROM customers"
        customers_model.metrics = [
            Mock(spec=Metric, name="customer_count", expression="COUNT(DISTINCT customer_id)")
        ]
        customers_model.metrics[0].name = "customer_count"
        customers_model.metrics[0].expression = "COUNT(DISTINCT customer_id)"

        # Create a project-level metric that references both models using ${ref(model).field}
        cross_model_metric = Mock(spec=Metric)
        cross_model_metric.name = "revenue_per_customer"
        cross_model_metric.expression = "${ref(orders).revenue} / ${ref(customers).customer_count}"

        # Create project
        project = Mock(spec=Project)
        project.models = [orders_model, customers_model]
        project.metrics = [cross_model_metric]

        # Create a trace that uses the cross-model metric
        trace = Mock(spec=Trace)
        trace.name = "test_trace"
        trace.cohort_on = None
        trace.props = Mock(spec=TraceProps)
        trace.props.y = "?{${ref(revenue_per_customer)}}"
        trace.props.model_dump = Mock(return_value={"y": "?{${ref(revenue_per_customer)}}"})
        trace.order_by = []
        trace.filter_by = []
        trace.model_dump = Mock(return_value={"order_by": [], "filter_by": []})

        # Create tokenizer
        tokenizer = TraceTokenizer(trace=trace, model=orders_model, source=source, project=project)

        # Tokenize and check that only the other model is tracked (not the current model)
        tokenized = tokenizer.tokenize()
        assert tokenized.referenced_models is not None
        # Only customers should be tracked, not orders (which is the current model)
        assert set(tokenized.referenced_models) == {"customers"}

    def test_nested_metric_references(self):
        """Test that models are extracted from nested metric compositions."""
        # Create mock source
        source = Mock(spec=Source)
        source.type = "postgresql"
        source.name = "test_source"

        # Create models
        orders_model = Mock(spec=SqlModel)
        orders_model.name = "orders"
        orders_model.sql = "SELECT * FROM orders"
        orders_model.metrics = []

        customers_model = Mock(spec=SqlModel)
        customers_model.name = "customers"
        customers_model.sql = "SELECT * FROM customers"
        customers_model.metrics = []

        products_model = Mock(spec=SqlModel)
        products_model.name = "products"
        products_model.sql = "SELECT * FROM products"
        products_model.metrics = []

        # Create metrics that reference each other using ${ref()} syntax
        metric_a = Mock(spec=Metric)
        metric_a.name = "metric_a"
        metric_a.expression = "${ref(orders).amount} * ${ref(products).price}"

        metric_b = Mock(spec=Metric)
        metric_b.name = "metric_b"
        metric_b.expression = "${ref(metric_a)} / ${ref(customers).count}"

        # Create project
        project = Mock(spec=Project)
        project.models = [orders_model, customers_model, products_model]
        project.metrics = [metric_a, metric_b]

        # Create MetricResolver
        resolver = MetricResolver(project)

        # Get models from the nested metric
        models = resolver.get_models_from_metric("metric_b")

        # Should include all three models (orders and products from metric_a, customers from metric_b)
        assert models == {"orders", "products", "customers"}

    def test_model_scoped_metric_tracking(self):
        """Test that model-scoped metrics track their model correctly."""
        # Create mock source
        source = Mock(spec=Source)
        source.type = "postgresql"
        source.name = "test_source"

        # Create orders model with a metric
        orders_model = Mock(spec=SqlModel)
        orders_model.name = "orders"
        orders_model.sql = "SELECT * FROM orders"

        order_metric = Mock(spec=Metric)
        order_metric.name = "total_revenue"
        order_metric.expression = "SUM(amount) + SUM(tax)"
        orders_model.metrics = [order_metric]

        # Create project
        project = Mock(spec=Project)
        project.models = [orders_model]
        project.metrics = []

        # Create a trace that uses the model-scoped metric
        trace = Mock(spec=Trace)
        trace.name = "test_trace"
        trace.cohort_on = None
        trace.props = Mock(spec=TraceProps)
        trace.props.y = "?{${ref(orders).total_revenue}}"
        trace.props.model_dump = Mock(return_value={"y": "?{${ref(orders).total_revenue}}"})
        trace.order_by = []
        trace.filter_by = []
        trace.model_dump = Mock(return_value={"order_by": [], "filter_by": []})

        # Create tokenizer
        tokenizer = TraceTokenizer(trace=trace, model=orders_model, source=source, project=project)

        # Tokenize - since the metric is in the same model and doesn't reference other models,
        # referenced_models should be empty or None
        tokenized = tokenizer.tokenize()
        assert tokenized.referenced_models is None or len(tokenized.referenced_models) == 0

    def test_metric_with_model_ref_patterns(self):
        """Test extracting models from metrics with ${ref(model).field} patterns."""
        # Create models
        orders_model = Mock(spec=SqlModel)
        orders_model.name = "orders"
        orders_model.sql = "SELECT * FROM orders"
        orders_model.metrics = []

        customers_model = Mock(spec=SqlModel)
        customers_model.name = "customers"
        customers_model.sql = "SELECT * FROM customers"
        customers_model.metrics = []

        # Create a metric with explicit model references
        metric = Mock(spec=Metric)
        metric.name = "test_metric"
        metric.expression = "${ref(orders).total} + ${ref(customers).count}"

        # Create project
        project = Mock(spec=Project)
        project.models = [orders_model, customers_model]
        project.metrics = [metric]

        # Create MetricResolver
        resolver = MetricResolver(project)

        # Get models from the metric
        models = resolver.get_models_from_metric("test_metric")

        # Should include both models
        assert models == {"orders", "customers"}

    def test_no_duplicate_models(self):
        """Test that duplicate model references are deduplicated."""
        # Create models
        orders_model = Mock(spec=SqlModel)
        orders_model.name = "orders"
        orders_model.sql = "SELECT * FROM orders"

        order_metric1 = Mock(spec=Metric)
        order_metric1.name = "revenue"
        order_metric1.expression = "SUM(amount)"

        order_metric2 = Mock(spec=Metric)
        order_metric2.name = "tax"
        order_metric2.expression = "SUM(tax_amount)"

        orders_model.metrics = [order_metric1, order_metric2]

        # Create a metric that references multiple metrics from the same model
        metric = Mock(spec=Metric)
        metric.name = "total"
        metric.expression = "${ref(orders).revenue} + ${ref(orders).tax}"

        # Create project
        project = Mock(spec=Project)
        project.models = [orders_model]
        project.metrics = [metric]

        # Create MetricResolver
        resolver = MetricResolver(project)

        # Get models from the metric
        models = resolver.get_models_from_metric("total")

        # Should only include orders once
        assert models == {"orders"}

    def test_project_level_metric_without_model_refs(self):
        """Test project-level metrics that don't reference any models."""
        # Create a model
        model = Mock(spec=SqlModel)
        model.name = "test_model"
        model.sql = "SELECT * FROM test"
        model.metrics = []

        # Create a project-level metric without model references
        metric = Mock(spec=Metric)
        metric.name = "constant_metric"
        metric.expression = "100"

        # Create project
        project = Mock(spec=Project)
        project.models = [model]
        project.metrics = [metric]

        # Create MetricResolver
        resolver = MetricResolver(project)

        # Get models from the metric
        models = resolver.get_models_from_metric("constant_metric")

        # Should return empty set
        assert models == set()
