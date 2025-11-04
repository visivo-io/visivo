"""Tests for metric references validator."""

import pytest
from visivo.models.project import Project
from visivo.models.models.sql_model import SqlModel
from visivo.models.metric import Metric
from visivo.models.dimension import Dimension
from tests.factories.model_factories import SourceFactory


class TestMetricReferencesValidator:
    """Tests for metric reference validation."""

    def test_valid_metric_referencing_model(self):
        """Test that a metric can reference a model."""
        source = SourceFactory()
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
            metrics=[
                Metric(name="total_revenue", expression="SUM(amount)"),
            ],
        )

        # Should not raise
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            dashboards=[],
        )
        assert project is not None

    def test_valid_metric_referencing_other_metric(self):
        """Test that a metric can reference another metric."""
        source = SourceFactory()
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
        )

        metric1 = Metric(
            name="total_revenue", expression="${ref(orders).amount} * ${ref(orders).quantity}"
        )
        metric2 = Metric(
            name="avg_revenue", expression="${ref(total_revenue)} / ${ref(orders).order_count}"
        )

        # Should not raise
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            metrics=[metric1, metric2],
            dashboards=[],
        )
        assert project is not None

    def test_valid_metric_referencing_dimension(self):
        """Test that a metric can reference a dimension."""
        source = SourceFactory()
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
        )

        dimension = Dimension(name="order_year", expression="YEAR(${ref(orders).order_date})")
        metric = Metric(name="revenue_by_year", expression="SUM(${ref(orders).amount})")

        # Should not raise
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            dimensions=[dimension],
            metrics=[metric],
            dashboards=[],
        )
        assert project is not None

    def test_nested_metric_in_model(self):
        """Test that nested metrics automatically tie to their parent model."""
        source = SourceFactory()
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
            metrics=[
                Metric(name="total_revenue", expression="SUM(amount)"),
                Metric(name="avg_revenue", expression="AVG(amount)"),
            ],
        )

        # Should not raise - nested metrics tie to parent
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            dashboards=[],
        )
        assert project is not None

    def test_metric_chain_references(self):
        """Test that a chain of metrics all referencing each other is valid."""
        source = SourceFactory()
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
        )

        metric1 = Metric(name="revenue", expression="SUM(${ref(orders).amount})")
        metric2 = Metric(name="double_revenue", expression="${ref(revenue)} * 2")
        metric3 = Metric(name="triple_revenue", expression="${ref(double_revenue)} * 1.5")

        # Should not raise - all valid metric references
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            metrics=[metric1, metric2, metric3],
            dashboards=[],
        )
        assert project is not None
