"""Tests for semantic layer validator."""

import pytest
from visivo.models.project import Project
from visivo.models.models.sql_model import SqlModel
from visivo.models.models.csv_script_model import CsvScriptModel
from visivo.models.models.local_merge_model import LocalMergeModel
from visivo.models.metric import Metric
from visivo.models.dimension import Dimension
from visivo.models.relation import Relation
from tests.factories.model_factories import SourceFactory


class TestSemanticLayerValidator:
    """Tests for semantic layer reference validation."""

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

    def test_valid_dimension_referencing_model(self):
        """Test that a dimension can reference a model."""
        source = SourceFactory()
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
            dimensions=[
                Dimension(name="order_month", expression="DATE_TRUNC('month', order_date)"),
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

    def test_valid_dimension_referencing_dimension(self):
        """Test that a dimension can reference another dimension."""
        source = SourceFactory()
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
        )

        dim1 = Dimension(name="order_date", expression="${ref(orders).created_at}")
        dim2 = Dimension(name="order_year", expression="YEAR(${ref(order_date)})")

        # Should not raise
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            dimensions=[dim1, dim2],
            dashboards=[],
        )
        assert project is not None

    def test_valid_relation_referencing_models(self):
        """Test that a relation can reference models."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
        )
        users_model = SqlModel(
            name="users",
            sql="SELECT * FROM users",
            source=f"ref({source.name})",
        )

        relation = Relation(
            name="orders_to_users",
            condition="${ref(orders).user_id} = ${ref(users).id}",
            join_type="inner",
        )

        # Should not raise
        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model, users_model],
            relations=[relation],
            dashboards=[],
        )
        assert project is not None

    def test_metric_ties_back_to_single_sql_model(self):
        """Test that all metric references tie back to a single SqlModel."""
        source = SourceFactory()
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
        )

        metric1 = Metric(name="total_revenue", expression="SUM(${ref(orders).amount})")
        metric2 = Metric(name="avg_revenue", expression="${ref(total_revenue)} / 100")

        # Should not raise - both metrics tie back to single model
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            metrics=[metric1, metric2],
            dashboards=[],
        )
        assert project is not None

    def test_metric_ties_back_to_single_csv_model(self):
        """Test that all metric references tie back to a single CsvScriptModel."""
        csv_model = CsvScriptModel(
            name="data",
            table_name="data",
            args=["echo", "x,y\n1,2"],
        )

        metric = Metric(name="total_x", expression="SUM(${ref(data).x})")

        # Should not raise
        project = Project(
            name="test_project",
            models=[csv_model],
            metrics=[metric],
            dashboards=[],
        )
        assert project is not None

    def test_metric_ties_back_to_single_local_merge_model(self):
        """Test that all metric references tie back to a single LocalMergeModel."""
        source = SourceFactory()
        base_model = SqlModel(
            name="base",
            sql="SELECT * FROM base_table",
            source=f"ref({source.name})",
        )

        merge_model = LocalMergeModel(
            name="merged",
            sql="SELECT * FROM base",
            models=["ref(base)"],
        )

        metric = Metric(name="total_count", expression="COUNT(${ref(merged).id})")

        # Should not raise
        project = Project(
            name="test_project",
            sources=[source],
            models=[base_model, merge_model],
            metrics=[metric],
            dashboards=[],
        )
        assert project is not None

    def test_metric_referencing_multiple_base_models_fails(self):
        """Test that a metric cannot reference multiple base models."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
        )
        users_model = SqlModel(
            name="users",
            sql="SELECT * FROM users",
            source=f"ref({source.name})",
        )

        # This metric references both models - should fail
        metric = Metric(
            name="bad_metric",
            expression="${ref(orders).amount} + ${ref(users).balance}",
        )

        with pytest.raises(ValueError) as exc_info:
            Project(
                name="test_project",
                sources=[source],
                models=[orders_model, users_model],
                metrics=[metric],
                dashboards=[],
            )

        assert "ties back to multiple base models" in str(exc_info.value)
        assert "orders" in str(exc_info.value)
        assert "users" in str(exc_info.value)

    def test_metric_without_base_model_fails(self):
        """Test that a metric must tie back to a base model."""
        # Metric with no model reference
        metric = Metric(name="orphan_metric", expression="42")

        with pytest.raises(ValueError) as exc_info:
            Project(
                name="test_project",
                metrics=[metric],
                dashboards=[],
            )

        assert "does not tie back to any base model" in str(exc_info.value)

    def test_metric_chain_ties_to_single_model(self):
        """Test that a chain of metrics all tie back to the same model."""
        source = SourceFactory()
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
        )

        metric1 = Metric(name="revenue", expression="SUM(${ref(orders).amount})")
        metric2 = Metric(name="double_revenue", expression="${ref(revenue)} * 2")
        metric3 = Metric(name="triple_revenue", expression="${ref(double_revenue)} * 1.5")

        # Should not raise - all metrics in chain tie back to single model
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            metrics=[metric1, metric2, metric3],
            dashboards=[],
        )
        assert project is not None

    def test_metric_referencing_dimension_from_same_model(self):
        """Test metric referencing dimension where both tie to same model."""
        source = SourceFactory()
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
        )

        dimension = Dimension(name="order_year", expression="YEAR(${ref(orders).order_date})")
        metric = Metric(name="revenue_by_year", expression="SUM(${ref(orders).amount})")

        # Should not raise - both tie to same model
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            dimensions=[dimension],
            metrics=[metric],
            dashboards=[],
        )
        assert project is not None

    def test_nested_metric_ties_to_parent_model(self):
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
