"""
Tests for metric composition in TraceTokenizer.
"""

import pytest
from unittest.mock import Mock
from visivo.query.trace_tokenizer import TraceTokenizer
from visivo.models.trace import Trace
from visivo.models.trace_props.trace_props import TraceProps
from visivo.models.metric import Metric


class TestMetricComposition:
    """Test suite for metric composition functionality in TraceTokenizer."""

    @pytest.fixture(autouse=True)
    def setup(self, mocker):
        """Common setup for all tests."""
        # Create mock source
        self.source = Mock()
        self.source.type = "postgresql"
        self.source.name = "test_source"

        # Create mock model
        self.model = Mock()
        self.model.name = "orders"
        self.model.sql = "SELECT * FROM orders"
        self.model.metrics = []
        self.model.dimensions = []

        # Create mock project with DAG
        self.project = Mock()
        self.project.metrics = []
        self.project.models = []
        self.project.dimensions = []

        # Mock DAG
        self.mock_dag = Mock()
        self.mock_dag.__len__ = Mock(return_value=0)
        self.mock_dag.nodes = Mock(return_value=[])
        self.mock_dag.predecessors = Mock(return_value=[])
        self.project.dag = Mock(return_value=self.mock_dag)

        # Default mocker patch for descendants
        self.mock_descendants = mocker.patch(
            "visivo.models.dag.all_descendants_of_type", return_value=[]
        )

    def _create_trace_with_y(self, y_expression, name="test_trace"):
        """Helper to create a mock trace with specific y expression."""
        trace = Mock(spec=Trace)
        trace.name = name
        trace.cohort_on = None
        trace.props = Mock(spec=TraceProps)
        trace.props.y = y_expression
        trace.props.model_dump = Mock(return_value={"y": y_expression})
        trace.order_by = []
        trace.filters = []
        trace.model_dump = Mock(return_value={"order_by": [], "filters": []})
        return trace

    def _create_tokenizer(self, trace):
        """Helper to create a tokenizer."""
        return TraceTokenizer(
            trace=trace, model=self.model, source=self.source, project=self.project
        )

    def _assert_in_y_value(self, tokenized, *expected_strings):
        """Helper to assert multiple strings are in the y value."""
        y_value = tokenized.select_items.get("props.y", "")
        for expected in expected_strings:
            assert expected in y_value, f"Expected '{expected}' in y value: {y_value}"

    @pytest.mark.parametrize(
        "base_expression,derived_expression,expected_patterns",
        [
            # Simple metric to metric reference
            (
                "SUM(amount)",
                "${ref(base_metric)} / COUNT(DISTINCT customer_id)",
                ["(SUM(amount))", "COUNT(DISTINCT customer_id)"],
            ),
            # Different aggregation functions
            ("AVG(price)", "${ref(base_metric)} * 1.2", ["(AVG(price))", "* 1.2"]),
            ("COUNT(*)", "${ref(base_metric)} + 100", ["(COUNT(*))", "+ 100"]),
        ],
    )
    def test_metric_reference_resolution(
        self, base_expression, derived_expression, expected_patterns
    ):
        """Test resolving metrics that reference other metrics with various expressions."""
        # Create mock metrics
        base_metric = Mock(spec=Metric)
        base_metric.name = "base_metric"
        base_metric.expression = base_expression

        derived_metric = Mock(spec=Metric)
        derived_metric.name = "derived_metric"
        derived_metric.expression = derived_expression

        # Update mocks
        self.project.metrics = [base_metric, derived_metric]
        self.mock_descendants.return_value = [base_metric, derived_metric]

        # Create trace and tokenize
        trace = self._create_trace_with_y(f"?{{${{ref(derived_metric)}}}}")
        tokenized = self._create_tokenizer(trace).tokenize()

        # Assert expected patterns are in result
        self._assert_in_y_value(tokenized, *expected_patterns)

    @pytest.mark.parametrize(
        "depth,expressions",
        [
            # 2-level nesting
            (2, ["COUNT(*)", "${ref(base_count)} * 2"]),
            # 3-level nesting
            (3, ["COUNT(*)", "${ref(base_count)} * 2", "${ref(doubled_count)} + 100"]),
            # 4-level nesting
            (
                4,
                [
                    "COUNT(*)",
                    "${ref(base_count)} * 2",
                    "${ref(doubled_count)} + 100",
                    "${ref(final_metric)} / 10",
                ],
            ),
        ],
    )
    def test_nested_metric_composition_levels(self, depth, expressions):
        """Test resolving nested metric compositions at various depths."""
        metrics = []

        # Build metric chain
        for i, expr in enumerate(expressions):
            if i == 0:
                name = "base_count"
            elif i == 1:
                name = "doubled_count"
            elif i == 2:
                name = "final_metric"
            else:
                name = f"m{i}"

            metric = Mock(spec=Metric)
            metric.name = name
            metric.expression = expr
            metrics.append(metric)

        # Update mocks
        self.project.metrics = metrics
        self.mock_descendants.return_value = metrics

        # Use last metric in trace
        trace = self._create_trace_with_y(f"?{{${{ref({metrics[-1].name})}}}}")
        tokenized = self._create_tokenizer(trace).tokenize()

        # Verify base expression appears in result
        y_value = tokenized.select_items.get("props.y", "")
        assert "COUNT(*)" in y_value

    def test_model_qualified_metric_with_composition(self):
        """Test resolving model-qualified metrics that use composition."""
        # Create model metric
        model_metric = Mock(spec=Metric)
        model_metric.name = "order_total"
        model_metric.expression = "SUM(amount)"
        self.model.metrics = [model_metric]

        # Create project metric referencing model metric
        project_metric = Mock(spec=Metric)
        project_metric.name = "adjusted_total"
        project_metric.expression = "${ref(orders).order_total} * 1.1"
        self.project.metrics = [project_metric]

        # Update mocks
        self.mock_descendants.return_value = [model_metric, project_metric]

        # Mock predecessors for model metric
        def mock_predecessors(node):
            return [self.model] if node == model_metric else []

        self.mock_dag.predecessors = mock_predecessors

        # Create trace and tokenize
        trace = self._create_trace_with_y("?{${ref(adjusted_total)}}")
        tokenized = self._create_tokenizer(trace).tokenize()

        # Assert resolution
        self._assert_in_y_value(tokenized, "(SUM(amount))", "* 1.1")

    def test_multiple_metric_references_in_expression(self):
        """Test resolving multiple metric references in a single expression."""
        # Create base metrics
        metrics = []
        for name, expr in [
            ("revenue", "SUM(revenue)"),
            ("costs", "SUM(costs)"),
            ("profit", "${ref(revenue)} - ${ref(costs)}"),
        ]:
            metric = Mock(spec=Metric)
            metric.name = name
            metric.expression = expr
            metrics.append(metric)

        # Update mocks
        self.project.metrics = metrics
        self.mock_descendants.return_value = metrics

        # Create trace with multiple metric references
        trace = self._create_trace_with_y("?{${ref(profit)} / ${ref(revenue)} * 100}")
        tokenized = self._create_tokenizer(trace).tokenize()

        # Assert all components are resolved
        self._assert_in_y_value(tokenized, "SUM(revenue)", "SUM(costs)", "* 100")

    @pytest.mark.parametrize(
        "filter_expr,metric_name,metric_expr,expected",
        [
            (
                "?{order_value > ${ref(threshold)}}",
                "threshold",
                "AVG(order_value) * 2",
                "AVG(order_value)",
            ),
            ("?{count > ${ref(min_count)}}", "min_count", "COUNT(*) * 0.8", "COUNT(*)"),
        ],
    )
    def test_metric_composition_in_filter(self, filter_expr, metric_name, metric_expr, expected):
        """Test using composed metrics in filter expressions."""
        # Create metric
        metric = Mock(spec=Metric)
        metric.name = metric_name
        metric.expression = metric_expr

        # Update mocks
        self.project.metrics = [metric]
        self.mock_descendants.return_value = [metric]

        # Create trace with filter
        trace = self._create_trace_with_y("?{COUNT(*)}")
        trace.filters = [filter_expr]
        trace.model_dump = Mock(return_value={"order_by": [], "filters": [filter_expr]})

        tokenized = self._create_tokenizer(trace).tokenize()

        # Assert filter contains resolved metric
        assert hasattr(tokenized, "filter_by") and tokenized.filter_by is not None
        assert expected in str(tokenized.filter_by)

    def test_backward_compatibility_without_project(self):
        """Test that TraceTokenizer works without a project (backward compatibility)."""
        # Create model metric
        model_metric = Mock(spec=Metric)
        model_metric.name = "total"
        model_metric.expression = "SUM(amount)"
        self.model.metrics = [model_metric]

        # Create trace
        trace = self._create_trace_with_y("?{${ref(orders).total}}")

        # Create tokenizer WITHOUT project
        tokenizer = TraceTokenizer(trace=trace, model=self.model, source=self.source)
        tokenized = tokenizer.tokenize()

        # Should still resolve model metrics
        assert "(SUM(amount))" in tokenized.select_items.get("props.y", "")

    @pytest.mark.parametrize(
        "circular_type,metric_a_expr,metric_b_expr",
        [
            ("direct", "${ref(metric_b)}", "${ref(metric_a)}"),
            ("self_reference", "${ref(metric_a)}", "COUNT(*)"),
            ("indirect", "${ref(metric_b)} + 1", "${ref(metric_c)}"),
        ],
    )
    def test_circular_dependency_handling(self, circular_type, metric_a_expr, metric_b_expr):
        """Test that circular dependencies in metrics are handled gracefully."""
        metrics = []
        for name, expr in [("metric_a", metric_a_expr), ("metric_b", metric_b_expr)]:
            metric = Mock(spec=Metric)
            metric.name = name
            metric.expression = expr
            metrics.append(metric)

        if circular_type == "indirect":
            metric_c = Mock(spec=Metric)
            metric_c.name = "metric_c"
            metric_c.expression = "${ref(metric_a)}"
            metrics.append(metric_c)

        # Update mocks
        self.project.metrics = metrics
        self.mock_descendants.return_value = metrics

        # Create trace
        trace = self._create_trace_with_y("?{${ref(metric_a)}}")
        tokenized = self._create_tokenizer(trace).tokenize()

        # Should contain unresolved reference due to circular dependency
        y_value = tokenized.select_items.get("props.y", "")
        assert "${ref(metric_a)}" in y_value or "${ref(metric_b)}" in y_value

    def test_nonexistent_metric_in_composition(self):
        """Test that references to non-existent metrics are handled."""
        # Create metric with broken reference
        broken_metric = Mock(spec=Metric)
        broken_metric.name = "broken"
        broken_metric.expression = "${ref(nonexistent)} * 2"

        # Update mocks
        self.project.metrics = [broken_metric]
        self.mock_descendants.return_value = [broken_metric]

        # Create trace
        trace = self._create_trace_with_y("?{${ref(broken)}}")
        tokenized = self._create_tokenizer(trace).tokenize()

        # Should contain unresolved reference
        y_value = tokenized.select_items.get("props.y", "")
        assert "${ref(nonexistent)}" in y_value or "(${ref(nonexistent)} * 2)" in y_value
