"""
Tests for metric composition in TraceTokenizer.
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


class TestMetricComposition:
    """Test suite for metric composition functionality in TraceTokenizer."""

    def setup_method(self):
        """Set up test fixtures."""
        # Create a mock source
        self.source = Mock(spec=Source)
        self.source.type = "postgresql"
        self.source.name = "test_source"

        # Create a mock model
        self.model = Mock(spec=SqlModel)
        self.model.name = "orders"
        self.model.sql = "SELECT * FROM orders"
        self.model.metrics = []

        # Create a mock project with proper DAG mocking
        self.project = Mock(spec=Project)
        self.project.metrics = []
        self.project.models = []

        # Create a mock DAG that returns empty list for descendants
        mock_dag = Mock()
        mock_dag.__len__ = Mock(return_value=0)
        mock_dag.nodes = Mock(return_value=[])
        self.project.dag = Mock(return_value=mock_dag)

    def test_simple_metric_to_metric_reference(self, mocker):
        """Test resolving a simple metric that references another metric."""
        # Create base metric
        base_metric = Mock(spec=Metric)
        base_metric.name = "total_revenue"
        base_metric.expression = "SUM(amount)"

        # Create derived metric that references the base
        derived_metric = Mock(spec=Metric)
        derived_metric.name = "average_revenue"
        derived_metric.expression = "${ref(total_revenue)} / COUNT(DISTINCT customer_id)"

        self.project.metrics = [base_metric, derived_metric]

        # Mock all_descendants_of_type to return our metrics
        mocker.patch(
            "visivo.models.dag.all_descendants_of_type",
            return_value=[base_metric, derived_metric],
        )

        # Mock DAG predecessors to return empty list (metrics have no model parent in this test)
        self.project.dag.return_value.predecessors = Mock(return_value=[])

        # Create a trace that uses the derived metric
        trace = Mock(spec=Trace)
        trace.name = "revenue_trace"
        trace.cohort_on = None
        trace.props = Mock(spec=TraceProps)
        trace.props.y = "?{${ref(average_revenue)}}"
        trace.props.model_dump = Mock(return_value={"y": "?{${ref(average_revenue)}}"})
        trace.order_by = []
        trace.filters = []
        trace.model_dump = Mock(return_value={"order_by": [], "filters": []})

        # Create tokenizer with project
        tokenizer = TraceTokenizer(
            trace=trace, model=self.model, source=self.source, project=self.project
        )

        # Check that the metric reference is resolved
        tokenized = tokenizer.tokenize()
        # The derived metric should resolve to: (SUM(amount)) / COUNT(DISTINCT customer_id)
        print(f"Select items: {tokenized.select_items}")
        assert "props.y" in tokenized.select_items
        assert "(SUM(amount))" in tokenized.select_items["props.y"]
        assert "COUNT(DISTINCT customer_id)" in tokenized.select_items["props.y"]

    def test_nested_metric_composition(self, mocker):
        """Test resolving nested metric compositions (A -> B -> C)."""
        # Create metrics with dependencies
        metric_a = Mock(spec=Metric)
        metric_a.name = "base_count"
        metric_a.expression = "COUNT(*)"

        metric_b = Mock(spec=Metric)
        metric_b.name = "doubled_count"
        metric_b.expression = "${ref(base_count)} * 2"

        metric_c = Mock(spec=Metric)
        metric_c.name = "final_metric"
        metric_c.expression = "${ref(doubled_count)} + 100"

        self.project.metrics = [metric_a, metric_b, metric_c]

        # Mock all_descendants_of_type to return our metrics
        mocker.patch(
            "visivo.models.dag.all_descendants_of_type",
            return_value=[metric_a, metric_b, metric_c],
        )

        # Mock DAG predecessors to return empty list
        self.project.dag.return_value.predecessors = Mock(return_value=[])

        # Create a trace that uses the final metric
        trace = Mock(spec=Trace)
        trace.name = "nested_trace"
        trace.cohort_on = None
        trace.props = Mock(spec=TraceProps)
        trace.props.x = "?{date}"
        trace.props.y = "?{${ref(final_metric)}}"
        trace.props.model_dump = Mock(return_value={"x": "?{date}", "y": "?{${ref(final_metric)}}"})
        trace.order_by = []
        trace.filters = []
        trace.model_dump = Mock(return_value={"order_by": [], "filters": []})

        # Create tokenizer with project
        tokenizer = TraceTokenizer(
            trace=trace, model=self.model, source=self.source, project=self.project
        )

        # Check that the nested metric reference is fully resolved
        tokenized = tokenizer.tokenize()
        # Should resolve to: ((COUNT(*)) * 2) + 100
        y_value = tokenized.select_items.get("props.y", "")
        assert "(COUNT(*))" in y_value
        assert "* 2" in y_value
        assert "+ 100" in y_value

    def test_model_qualified_metric_with_composition(self, mocker):
        """Test resolving model-qualified metrics that use composition."""
        # Create a metric on the model
        model_metric = Mock(spec=Metric)
        model_metric.name = "order_total"
        model_metric.expression = "SUM(amount)"
        self.model.metrics = [model_metric]

        # Create a project-level metric that references the model metric
        project_metric = Mock(spec=Metric)
        project_metric.name = "adjusted_total"
        project_metric.expression = "${ref(orders).order_total} * 1.1"

        self.project.metrics = [project_metric]
        self.project.models = [self.model]

        # Mock all_descendants_of_type to return our metrics
        mocker.patch(
            "visivo.models.dag.all_descendants_of_type",
            return_value=[model_metric, project_metric],
        )

        # Mock DAG predecessors - model_metric has model as parent
        def mock_predecessors(node):
            if node == model_metric:
                return [self.model]
            return []

        self.project.dag.return_value.predecessors = mock_predecessors

        # Create a trace that uses the project metric
        trace = Mock(spec=Trace)
        trace.name = "adjusted_trace"
        trace.cohort_on = None
        trace.props = Mock(spec=TraceProps)
        trace.props.y = "?{${ref(adjusted_total)}}"
        trace.props.model_dump = Mock(return_value={"y": "?{${ref(adjusted_total)}}"})
        trace.order_by = []
        trace.filters = []
        trace.model_dump = Mock(return_value={"order_by": [], "filters": []})

        # Create tokenizer with project
        tokenizer = TraceTokenizer(
            trace=trace, model=self.model, source=self.source, project=self.project
        )

        # Check that the metric reference is resolved
        tokenized = tokenizer.tokenize()
        # Should resolve to: (SUM(amount)) * 1.1
        assert "(SUM(amount))" in tokenized.select_items.get("props.y", "")
        assert "* 1.1" in tokenized.select_items.get("props.y", "")

    def test_multiple_metric_references_in_expression(self, mocker):
        """Test resolving multiple metric references in a single expression."""
        # Create base metrics
        metric1 = Mock(spec=Metric)
        metric1.name = "revenue"
        metric1.expression = "SUM(revenue)"

        metric2 = Mock(spec=Metric)
        metric2.name = "costs"
        metric2.expression = "SUM(costs)"

        # Create a derived metric that uses both
        profit_metric = Mock(spec=Metric)
        profit_metric.name = "profit"
        profit_metric.expression = "${ref(revenue)} - ${ref(costs)}"

        self.project.metrics = [metric1, metric2, profit_metric]

        # Mock all_descendants_of_type to return our metrics
        mocker.patch(
            "visivo.models.dag.all_descendants_of_type",
            return_value=[metric1, metric2, profit_metric],
        )

        # Mock DAG predecessors to return empty list
        self.project.dag.return_value.predecessors = Mock(return_value=[])

        # Create a trace that calculates profit margin
        trace = Mock(spec=Trace)
        trace.name = "profit_margin_trace"
        trace.cohort_on = None
        trace.props = Mock(spec=TraceProps)
        # Using profit metric divided by revenue metric
        trace.props.y = "?{${ref(profit)} / ${ref(revenue)} * 100}"
        trace.props.model_dump = Mock(
            return_value={"y": "?{${ref(profit)} / ${ref(revenue)} * 100}"}
        )
        trace.order_by = []
        trace.filters = []
        trace.model_dump = Mock(return_value={"order_by": [], "filters": []})

        # Create tokenizer with project
        tokenizer = TraceTokenizer(
            trace=trace, model=self.model, source=self.source, project=self.project
        )

        # Check that all metric references are resolved
        tokenized = tokenizer.tokenize()
        y_value = tokenized.select_items.get("props.y", "")
        # profit should resolve to ((SUM(revenue)) - (SUM(costs)))
        # revenue should resolve to (SUM(revenue))
        # So the full expression should have both
        assert "SUM(revenue)" in y_value
        assert "SUM(costs)" in y_value
        assert "* 100" in y_value

    def test_metric_composition_in_filter(self, mocker):
        """Test using composed metrics in filter expressions."""
        # Create metrics
        base_metric = Mock(spec=Metric)
        base_metric.name = "average_order_value"
        base_metric.expression = "AVG(order_value)"

        threshold_metric = Mock(spec=Metric)
        threshold_metric.name = "high_value_threshold"
        threshold_metric.expression = "${ref(average_order_value)} * 2"

        self.project.metrics = [base_metric, threshold_metric]

        # Mock all_descendants_of_type to return our metrics
        mocker.patch(
            "visivo.models.dag.all_descendants_of_type",
            return_value=[base_metric, threshold_metric],
        )

        # Mock DAG predecessors
        self.project.dag.return_value.predecessors = Mock(return_value=[])

        # Create a trace with a filter using the composed metric
        trace = Mock(spec=Trace)
        trace.name = "high_value_orders"
        trace.cohort_on = None
        trace.props = Mock(spec=TraceProps)
        trace.props.y = "?{COUNT(*)}"
        trace.props.model_dump = Mock(return_value={"y": "?{COUNT(*)}"})
        trace.order_by = []
        trace.filters = ["?{order_value > ${ref(high_value_threshold)}}"]
        trace.model_dump = Mock(
            return_value={
                "order_by": [],
                "filters": ["?{order_value > ${ref(high_value_threshold)}}"],
            }
        )

        # Create tokenizer with project
        tokenizer = TraceTokenizer(
            trace=trace, model=self.model, source=self.source, project=self.project
        )

        # Check that the metric in filter is resolved
        tokenized = tokenizer.tokenize()
        # Filter should resolve to: order_value > ((AVG(order_value)) * 2)
        print(f"Filter by: {tokenized.filter_by}")
        assert hasattr(tokenized, "filter_by") and tokenized.filter_by is not None
        # filter_by is a dict with 'aggregate', 'window', 'vanilla' keys
        assert "((AVG(order_value)) * 2)" in str(tokenized.filter_by)

    def test_backward_compatibility_without_project(self):
        """Test that TraceTokenizer still works without a project (backward compatibility)."""
        # Create a model metric
        model_metric = Mock(spec=Metric)
        model_metric.name = "total"
        model_metric.expression = "SUM(amount)"
        self.model.metrics = [model_metric]

        # Create a trace that uses the model metric
        trace = Mock(spec=Trace)
        trace.name = "backward_compat_trace"
        trace.cohort_on = None
        trace.props = Mock(spec=TraceProps)
        trace.props.y = "?{${ref(orders).total}}"
        trace.props.model_dump = Mock(return_value={"y": "?{${ref(orders).total}}"})
        trace.order_by = []
        trace.filters = []
        trace.model_dump = Mock(return_value={"order_by": [], "filters": []})

        # Create tokenizer WITHOUT project (backward compatibility)
        tokenizer = TraceTokenizer(trace=trace, model=self.model, source=self.source)

        # Should still resolve model metrics
        tokenized = tokenizer.tokenize()
        assert "(SUM(amount))" in tokenized.select_items.get("props.y", "")

    def test_circular_dependency_handling(self, mocker):
        """Test that circular dependencies in metrics are handled gracefully."""
        # Create metrics with circular dependency
        metric_a = Mock(spec=Metric)
        metric_a.name = "metric_a"
        metric_a.expression = "${ref(metric_b)}"

        metric_b = Mock(spec=Metric)
        metric_b.name = "metric_b"
        metric_b.expression = "${ref(metric_a)}"

        self.project.metrics = [metric_a, metric_b]

        # Mock all_descendants_of_type to return our metrics
        mocker.patch(
            "visivo.models.dag.all_descendants_of_type",
            return_value=[metric_a, metric_b],
        )

        # Mock DAG predecessors
        self.project.dag.return_value.predecessors = Mock(return_value=[])

        # Create a trace that tries to use a circular metric
        trace = Mock(spec=Trace)
        trace.name = "circular_trace"
        trace.cohort_on = None
        trace.props = Mock(spec=TraceProps)
        trace.props.y = "?{${ref(metric_a)}}"
        trace.props.model_dump = Mock(return_value={"y": "?{${ref(metric_a)}}"})
        trace.order_by = []
        trace.filters = []
        trace.model_dump = Mock(return_value={"order_by": [], "filters": []})

        # Create tokenizer with project
        tokenizer = TraceTokenizer(
            trace=trace, model=self.model, source=self.source, project=self.project
        )

        # Should handle circular dependency gracefully (not resolve)
        tokenized = tokenizer.tokenize()
        # The metric reference should remain unresolved due to circular dependency
        assert "${ref(metric_a)}" in tokenized.select_items.get(
            "props.y", ""
        ) or "${ref(metric_b)}" in tokenized.select_items.get("props.y", "")

    def test_nonexistent_metric_in_composition(self, mocker):
        """Test that references to non-existent metrics in compositions are handled."""
        # Create a metric that references a non-existent metric
        broken_metric = Mock(spec=Metric)
        broken_metric.name = "broken"
        broken_metric.expression = "${ref(nonexistent)} * 2"

        self.project.metrics = [broken_metric]

        # Mock all_descendants_of_type to return only the broken metric
        mocker.patch(
            "visivo.models.dag.all_descendants_of_type",
            return_value=[broken_metric],
        )

        # Mock DAG predecessors
        self.project.dag.return_value.predecessors = Mock(return_value=[])

        # Create a trace that uses the broken metric
        trace = Mock(spec=Trace)
        trace.name = "broken_trace"
        trace.cohort_on = None
        trace.props = Mock(spec=TraceProps)
        trace.props.y = "?{${ref(broken)}}"
        trace.props.model_dump = Mock(return_value={"y": "?{${ref(broken)}}"})
        trace.order_by = []
        trace.filters = []
        trace.model_dump = Mock(return_value={"order_by": [], "filters": []})

        # Create tokenizer with project
        tokenizer = TraceTokenizer(
            trace=trace, model=self.model, source=self.source, project=self.project
        )

        # Should not fully resolve due to missing reference
        tokenized = tokenizer.tokenize()
        # The broken metric should try to resolve but ${ref(nonexistent)} should remain unresolved
        y_value = tokenized.select_items.get("props.y", "")
        # Should contain the unresolved reference to 'nonexistent'
        assert "${ref(nonexistent)}" in y_value or "(${ref(nonexistent)} * 2)" in y_value
