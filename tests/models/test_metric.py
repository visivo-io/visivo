"""Tests for the Metric model."""

import pytest
from pydantic import ValidationError
from visivo.models.metric import Metric


class TestMetric:
    """Test suite for Metric model."""

    def test_create_model_scoped_metric(self):
        """Test creating a model-scoped metric with expression."""
        metric = Metric(
            name="total_revenue",
            expression="SUM(amount)",
            description="Total revenue from all orders",
        )

        assert metric.name == "total_revenue"
        assert metric.expression == "SUM(amount)"
        assert metric.description == "Total revenue from all orders"

    def test_create_global_metric(self):
        """Test creating a global metric with expression."""
        metric = Metric(
            name="revenue_per_user",
            expression="${ref(orders).total_revenue} / ${ref(users).total_users}",
            description="Average revenue per user",
        )

        assert metric.name == "revenue_per_user"
        assert metric.expression == "${ref(orders).total_revenue} / ${ref(users).total_users}"
        assert metric.description == "Average revenue per user"

    def test_metric_with_ref_syntax(self):
        """Test creating a metric with ref syntax for cross-model references."""
        metric = Metric(name="complex_metric", expression="${ref(a).value} + ${ref(b).value}")

        assert metric.name == "complex_metric"
        assert "${ref(a).value}" in metric.expression
        assert "${ref(b).value}" in metric.expression

    def test_minimal_metric(self):
        """Test creating a metric with only required fields."""
        metric = Metric(name="minimal_metric", expression="COUNT(*)")

        assert metric.name == "minimal_metric"
        assert metric.expression == "COUNT(*)"
        assert metric.description is None

    def test_metric_with_complex_aggregate(self):
        """Test metric with complex aggregate expression."""
        metric = Metric(
            name="unique_users",
            expression="COUNT(DISTINCT user_id)",
            description="Number of unique users",
        )

        assert metric.name == "unique_users"
        assert metric.expression == "COUNT(DISTINCT user_id)"

    def test_metric_with_case_expression(self):
        """Test metric with CASE statement in aggregate."""
        metric = Metric(
            name="active_users",
            expression="COUNT(DISTINCT CASE WHEN status = 'active' THEN user_id END)",
            description="Count of active users",
        )

        assert metric.name == "active_users"
        assert "CASE WHEN" in metric.expression

    def test_metric_forbids_extra_fields(self):
        """Test that extra fields are not allowed."""
        with pytest.raises(ValidationError) as exc_info:
            Metric(name="test_metric", expression="SUM(amount)", extra_field="not_allowed")

        assert "extra_field" in str(exc_info.value)

    def test_metric_requires_expression(self):
        """Test that expression is required."""
        with pytest.raises(ValidationError) as exc_info:
            Metric(name="test_metric")

        assert "expression" in str(exc_info.value)

    def test_metric_inherits_from_named_model(self):
        """Test that Metric properly inherits from NamedModel."""
        metric = Metric(name="test_metric", expression="COUNT(*)")

        # Should have NamedModel methods
        assert hasattr(metric, "id")
        assert metric.id() == "test_metric"
        assert str(metric) == "test_metric"

    def test_metric_file_path(self):
        """Test that Metric can have file_path from NamedModel."""
        metric = Metric(name="test_metric", expression="COUNT(*)", file_path="/path/to/config.yml")

        assert metric.file_path == "/path/to/config.yml"
