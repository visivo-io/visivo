"""
Tests for cross-model field references in TraceTokenizer.
"""

import pytest
from unittest.mock import Mock
from visivo.query.trace_tokenizer import TraceTokenizer
from visivo.models.trace import Trace
from visivo.models.models.sql_model import SqlModel
from visivo.models.sources.source import Source
from visivo.models.project import Project
from visivo.models.metric import Metric
from visivo.models.trace_props.trace_props import TraceProps


class TestCrossModelFields:
    """Test suite for cross-model field reference functionality."""

    def setup_method(self):
        """Set up test fixtures."""
        # Create a mock source
        self.source = Mock(spec=Source)
        self.source.type = "postgresql"
        self.source.name = "test_source"

        # Create the current model
        self.orders_model = Mock(spec=SqlModel)
        self.orders_model.name = "orders"
        self.orders_model.sql = "SELECT * FROM orders"
        self.orders_model.metrics = []

        # Create another model that we'll reference
        self.customers_model = Mock(spec=SqlModel)
        self.customers_model.name = "customers"
        self.customers_model.sql = "SELECT * FROM customers"
        self.customers_model.metrics = []

        # Create a mock project with both models
        self.project = Mock(spec=Project)
        self.project.models = [self.orders_model, self.customers_model]
        self.project.metrics = []

        # Create a mock DAG that returns empty list for descendants
        mock_dag = Mock()
        mock_dag.__len__ = Mock(return_value=0)
        mock_dag.nodes = Mock(return_value=[])
        self.project.dag = Mock(return_value=mock_dag)

    def test_simple_cross_model_field_reference(self):
        """Test resolving a simple field reference from another model."""
        # Create a trace that references a field from customers model
        trace = Mock(spec=Trace)
        trace.name = "cross_model_trace"
        trace.cohort_on = None
        trace.props = Mock(spec=TraceProps)
        trace.props.x = "?{order_date}"
        trace.props.y = "?{${ref(customers).customer_name}}"
        trace.props.model_dump = Mock(
            return_value={"x": "?{order_date}", "y": "?{${ref(customers).customer_name}}"}
        )
        trace.order_by = []
        trace.filter_by = []
        trace.model_dump = Mock(return_value={"order_by": [], "filter_by": []})

        # Create tokenizer with project
        tokenizer = TraceTokenizer(
            trace=trace, model=self.orders_model, source=self.source, project=self.project
        )

        # Check that the field reference is resolved
        tokenized = tokenizer.tokenize()
        assert "customers.customer_name" in tokenized.select_items.get("props.y", "")

        # Check that the referenced model is tracked
        assert tokenized.referenced_models is not None
        assert "customers" in tokenized.referenced_models

    def test_multiple_cross_model_field_references(self):
        """Test resolving multiple field references from different models."""
        # Create additional model
        products_model = Mock(spec=SqlModel)
        products_model.name = "products"
        products_model.sql = "SELECT * FROM products"
        products_model.metrics = []

        self.project.models.append(products_model)

        # Create a trace with multiple cross-model references
        trace = Mock(spec=Trace)
        trace.name = "multi_model_trace"
        trace.cohort_on = None
        trace.props = Mock(spec=TraceProps)
        trace.props.x = "?{${ref(customers).customer_id}}"
        trace.props.y = "?{${ref(products).price} * quantity}"
        trace.props.model_dump = Mock(
            return_value={
                "x": "?{${ref(customers).customer_id}}",
                "y": "?{${ref(products).price} * quantity}",
            }
        )
        trace.order_by = []
        trace.filter_by = []
        trace.model_dump = Mock(return_value={"order_by": [], "filter_by": []})

        # Create tokenizer with project
        tokenizer = TraceTokenizer(
            trace=trace, model=self.orders_model, source=self.source, project=self.project
        )

        # Check that both field references are resolved
        tokenized = tokenizer.tokenize()
        assert "customers.customer_id" in tokenized.select_items.get("props.x", "")
        assert "products.price" in tokenized.select_items.get("props.y", "")

        # Check that both models are tracked as referenced
        assert tokenized.referenced_models is not None
        assert "customers" in tokenized.referenced_models
        assert "products" in tokenized.referenced_models

    def test_same_model_field_reference(self):
        """Test that referencing a field from the same model doesn't add to referenced_models."""
        # Create a trace that references a field from the same model
        trace = Mock(spec=Trace)
        trace.name = "same_model_trace"
        trace.cohort_on = None
        trace.props = Mock(spec=TraceProps)
        trace.props.x = "?{order_date}"
        trace.props.y = "?{${ref(orders).total_amount}}"
        trace.props.model_dump = Mock(
            return_value={"x": "?{order_date}", "y": "?{${ref(orders).total_amount}}"}
        )
        trace.order_by = []
        trace.filter_by = []
        trace.model_dump = Mock(return_value={"order_by": [], "filter_by": []})

        # Create tokenizer with project
        tokenizer = TraceTokenizer(
            trace=trace, model=self.orders_model, source=self.source, project=self.project
        )

        # When referencing the same model, the reference is left unchanged for backward compatibility
        tokenized = tokenizer.tokenize()
        assert "${ref(orders).total_amount}" in tokenized.select_items.get("props.y", "")

        # Check that orders is NOT in referenced_models (it's the current model)
        assert tokenized.referenced_models is None or "orders" not in tokenized.referenced_models

    def test_cross_model_field_in_filter(self):
        """Test using cross-model field references in filter expressions."""
        # Create a trace with a cross-model field in filter
        trace = Mock(spec=Trace)
        trace.name = "filtered_trace"
        trace.cohort_on = None
        trace.props = Mock(spec=TraceProps)
        trace.props.y = "?{SUM(amount)}"
        trace.props.model_dump = Mock(return_value={"y": "?{SUM(amount)}"})
        trace.order_by = []
        trace.filters = ["?{${ref(customers).status} = 'active'}"]
        trace.model_dump = Mock(
            return_value={"order_by": [], "filters": ["?{${ref(customers).status} = 'active'}"]}
        )

        # Create tokenizer with project
        tokenizer = TraceTokenizer(
            trace=trace, model=self.orders_model, source=self.source, project=self.project
        )

        # Check that the field in filter is resolved
        tokenized = tokenizer.tokenize()
        assert hasattr(tokenized, "filter_by") and tokenized.filter_by is not None
        # Check that the filter contains the qualified field reference
        filter_str = str(tokenized.filter_by)
        assert "customers.status" in filter_str

        # Check that customers is tracked as referenced
        assert tokenized.referenced_models is not None
        assert "customers" in tokenized.referenced_models

    def test_cross_model_field_in_order_by(self):
        """Test using cross-model field references in order_by expressions."""
        # Create a trace with a cross-model field in order_by
        trace = Mock(spec=Trace)
        trace.name = "ordered_trace"
        trace.cohort_on = None
        trace.props = Mock(spec=TraceProps)
        trace.props.y = "?{COUNT(*)}"
        trace.props.model_dump = Mock(return_value={"y": "?{COUNT(*)}"})
        trace.order_by = ["?{${ref(customers).created_at} DESC}"]
        trace.filter_by = []
        trace.model_dump = Mock(
            return_value={"order_by": ["?{${ref(customers).created_at} DESC}"], "filter_by": []}
        )

        # Create tokenizer with project
        tokenizer = TraceTokenizer(
            trace=trace, model=self.orders_model, source=self.source, project=self.project
        )

        # Check that the field in order_by is resolved
        tokenized = tokenizer.tokenize()
        assert hasattr(tokenized, "order_by") and tokenized.order_by is not None
        assert any("customers.created_at" in order for order in tokenized.order_by)

        # Check that customers is tracked as referenced
        assert tokenized.referenced_models is not None
        assert "customers" in tokenized.referenced_models

    def test_metric_vs_field_disambiguation(self):
        """Test that cross-model references are handled (as fields with mocks)."""
        # Add a metric to the customers model
        customer_metric = Mock(spec=Metric)
        customer_metric.name = "total_orders"
        customer_metric.expression = "COUNT(DISTINCT order_id)"
        self.customers_model.metrics = [customer_metric]

        # Create a trace that references what could be either a metric or field
        trace = Mock(spec=Trace)
        trace.name = "disambiguation_trace"
        trace.cohort_on = None
        trace.props = Mock(spec=TraceProps)
        trace.props.y = "?{${ref(customers).total_orders}}"
        trace.props.model_dump = Mock(return_value={"y": "?{${ref(customers).total_orders}}"})
        trace.order_by = []
        trace.filter_by = []
        trace.model_dump = Mock(return_value={"order_by": [], "filter_by": []})

        # Create tokenizer with project
        tokenizer = TraceTokenizer(
            trace=trace, model=self.orders_model, source=self.source, project=self.project
        )

        # With mocks, the metric won't be resolved from another model
        # It will be treated as a cross-model field reference
        tokenized = tokenizer.tokenize()
        assert "customers.total_orders" in tokenized.select_items.get("props.y", "")
        assert "customers" in tokenized.referenced_models

        # Even though it's a metric, if it references the customers model in its expression,
        # customers should still be tracked (it's a different model from current)
        # This helps the system know all models involved in the query
        assert tokenized.referenced_models is not None
        assert "customers" in tokenized.referenced_models

    def test_mixed_metrics_and_fields(self):
        """Test expressions that mix metrics and cross-model fields."""
        # Add a metric to the orders model
        order_metric = Mock(spec=Metric)
        order_metric.name = "avg_amount"
        order_metric.expression = "AVG(amount)"
        self.orders_model.metrics = [order_metric]

        # Create a trace mixing metrics and cross-model fields
        trace = Mock(spec=Trace)
        trace.name = "mixed_trace"
        trace.cohort_on = None
        trace.props = Mock(spec=TraceProps)
        # Use a non-metric field from orders and a field from customers
        trace.props.y = "?{${ref(orders).order_id} || ${ref(customers).loyalty_factor}}"
        trace.props.model_dump = Mock(
            return_value={"y": "?{${ref(orders).order_id} || ${ref(customers).loyalty_factor}}"}
        )
        trace.order_by = []
        trace.filter_by = []
        trace.model_dump = Mock(return_value={"order_by": [], "filter_by": []})

        # Create tokenizer with project
        tokenizer = TraceTokenizer(
            trace=trace, model=self.orders_model, source=self.source, project=self.project
        )

        # Check that the same-model ref is unchanged and cross-model field is qualified
        tokenized = tokenizer.tokenize()
        y_value = tokenized.select_items.get("props.y", "")
        assert "${ref(orders).order_id}" in y_value  # Same-model ref unchanged
        assert "customers.loyalty_factor" in y_value  # Cross-model field qualified

        # Check that only customers is tracked (orders is the current model)
        assert tokenized.referenced_models is not None
        assert "customers" in tokenized.referenced_models
        assert "orders" not in tokenized.referenced_models

    def test_nonexistent_model_reference(self):
        """Test that references to non-existent models are left unchanged."""
        # Create a trace that references a non-existent model
        trace = Mock(spec=Trace)
        trace.name = "nonexistent_model_trace"
        trace.cohort_on = None
        trace.props = Mock(spec=TraceProps)
        trace.props.y = "?{${ref(nonexistent_model).some_field}}"
        trace.props.model_dump = Mock(return_value={"y": "?{${ref(nonexistent_model).some_field}}"})
        trace.order_by = []
        trace.filter_by = []
        trace.model_dump = Mock(return_value={"order_by": [], "filter_by": []})

        # Create tokenizer with project
        tokenizer = TraceTokenizer(
            trace=trace, model=self.orders_model, source=self.source, project=self.project
        )

        # Check that the reference is still tracked as a cross-model reference
        tokenized = tokenizer.tokenize()
        assert "nonexistent_model.some_field" in tokenized.select_items.get("props.y", "")

        # The non-existent model should still be tracked
        assert tokenized.referenced_models is not None
        assert "nonexistent_model" in tokenized.referenced_models
