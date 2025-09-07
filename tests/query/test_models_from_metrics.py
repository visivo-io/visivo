"""
Tests for extracting model references from resolved metrics using DAG.
"""

import pytest
from visivo.query.trace_tokenizer import TraceTokenizer
from visivo.query.metric_resolver import MetricResolver
from visivo.models.trace import Trace
from visivo.models.models.sql_model import SqlModel
from visivo.models.sources.sqlite_source import SqliteSource
from visivo.models.project import Project
from visivo.models.metric import Metric
from visivo.models.trace_props.trace_props import TraceProps


class TestModelsFromMetrics:
    """Test suite for extracting model references from metrics using DAG."""

    def test_metric_with_cross_model_references(self):
        """Test that models are extracted from metrics that reference multiple models."""
        # Create real source
        source = SqliteSource(name="test_source", type="sqlite", database=":memory:")

        # Create models with metrics using source reference
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source="ref(test_source)",
            metrics=[Metric(name="revenue", expression="SUM(amount)")],
        )

        customers_model = SqlModel(
            name="customers",
            sql="SELECT * FROM customers",
            source="ref(test_source)",
            metrics=[Metric(name="customer_count", expression="COUNT(DISTINCT customer_id)")],
        )

        # Create a project-level metric that references both models using ${ref(model).field}
        cross_model_metric = Metric(
            name="revenue_per_customer",
            expression="${ref(orders).revenue} / ${ref(customers).customer_count}",
        )

        # Create project
        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model, customers_model],
            metrics=[cross_model_metric],
        )

        # Create a trace that uses the cross-model metric
        trace = Trace(
            name="test_trace",
            model=orders_model,
            props={"type": "scatter", "x": "?{x}", "y": "?{${ref(revenue_per_customer)}}"},
        )

        # Create tokenizer
        tokenizer = TraceTokenizer(trace=trace, model=orders_model, source=source, project=project)

        # Tokenize and check that only the other model is tracked (not the current model)
        tokenized = tokenizer.tokenize()
        assert tokenized.referenced_models is not None
        # Only customers should be tracked, not orders (which is the current model)
        assert set(tokenized.referenced_models) == {"customers"}

    def test_nested_metric_references(self):
        """Test that models are extracted from nested metric compositions."""
        # Create real source
        source = SqliteSource(name="test_source", type="sqlite", database=":memory:")

        # Create models
        orders_model = SqlModel(
            name="orders", sql="SELECT * FROM orders", source="ref(test_source)", metrics=[]
        )

        customers_model = SqlModel(
            name="customers", sql="SELECT * FROM customers", source="ref(test_source)", metrics=[]
        )

        products_model = SqlModel(
            name="products", sql="SELECT * FROM products", source="ref(test_source)", metrics=[]
        )

        # Create metrics that reference each other using ${ref()} syntax
        metric_a = Metric(
            name="metric_a", expression="${ref(orders).amount} * ${ref(products).price}"
        )

        metric_b = Metric(name="metric_b", expression="${ref(metric_a)} / ${ref(customers).count}")

        # Create project
        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model, customers_model, products_model],
            metrics=[metric_a, metric_b],
        )

        # Create MetricResolver
        resolver = MetricResolver(project)

        # Get models from the nested metric
        models = resolver.get_models_from_metric("metric_b")

        # Should include all three models (orders and products from metric_a, customers from metric_b)
        assert models == {"orders", "products", "customers"}

    def test_model_scoped_metric_tracking(self):
        """Test that model-scoped metrics track their model correctly."""
        # Create real source
        source = SqliteSource(name="test_source", type="sqlite", database=":memory:")

        # Create orders model with a metric
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source="ref(test_source)",
            metrics=[Metric(name="total_revenue", expression="SUM(amount) + SUM(tax)")],
        )

        # Create project
        project = Project(name="test_project", sources=[source], models=[orders_model], metrics=[])

        # Create a trace that uses the model-scoped metric
        trace = Trace(
            name="test_trace",
            model=orders_model,
            props={"type": "scatter", "x": "?{x}", "y": "?{${ref(orders).total_revenue}}"},
        )

        # Create tokenizer
        tokenizer = TraceTokenizer(trace=trace, model=orders_model, source=source, project=project)

        # Tokenize - since the metric is in the same model and doesn't reference other models,
        # referenced_models should be empty or None
        tokenized = tokenizer.tokenize()
        assert tokenized.referenced_models is None or len(tokenized.referenced_models) == 0

    def test_metric_with_model_ref_patterns(self):
        """Test extracting models from metrics with ${ref(model).field} patterns."""
        # Create source
        source = SqliteSource(name="test_source", type="sqlite", database=":memory:")

        # Create models
        orders_model = SqlModel(
            name="orders", sql="SELECT * FROM orders", source="ref(test_source)", metrics=[]
        )

        customers_model = SqlModel(
            name="customers", sql="SELECT * FROM customers", source="ref(test_source)", metrics=[]
        )

        # Create a metric with explicit model references
        metric = Metric(
            name="test_metric", expression="${ref(orders).total} + ${ref(customers).count}"
        )

        # Create project
        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model, customers_model],
            metrics=[metric],
        )

        # Create MetricResolver
        resolver = MetricResolver(project)

        # Get models from the metric
        models = resolver.get_models_from_metric("test_metric")

        # Should include both models
        assert models == {"orders", "customers"}

    def test_no_duplicate_models(self):
        """Test that duplicate model references are deduplicated."""
        # Create source
        source = SqliteSource(name="test_source", type="sqlite", database=":memory:")

        # Create models
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source="ref(test_source)",
            metrics=[
                Metric(name="revenue", expression="SUM(amount)"),
                Metric(name="tax", expression="SUM(tax_amount)"),
            ],
        )

        # Create a metric that references multiple metrics from the same model
        metric = Metric(name="total", expression="${ref(orders).revenue} + ${ref(orders).tax}")

        # Create project
        project = Project(
            name="test_project", sources=[source], models=[orders_model], metrics=[metric]
        )

        # Create MetricResolver
        resolver = MetricResolver(project)

        # Get models from the metric
        models = resolver.get_models_from_metric("total")

        # Should only include orders once
        assert models == {"orders"}

    def test_project_level_metric_without_model_refs(self):
        """Test project-level metrics that don't reference any models."""
        # Create source
        source = SqliteSource(name="test_source", type="sqlite", database=":memory:")

        # Create a model
        model = SqlModel(
            name="test_model", sql="SELECT * FROM test", source="ref(test_source)", metrics=[]
        )

        # Create a project-level metric without model references
        metric = Metric(name="constant_metric", expression="100")

        # Create project
        project = Project(name="test_project", sources=[source], models=[model], metrics=[metric])

        # Create MetricResolver
        resolver = MetricResolver(project)

        # Get models from the metric
        models = resolver.get_models_from_metric("constant_metric")

        # Should return empty set
        assert models == set()
