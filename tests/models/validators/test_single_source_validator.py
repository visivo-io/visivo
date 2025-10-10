"""Tests for single source validator."""

import pytest
from visivo.models.project import Project
from visivo.models.models.sql_model import SqlModel
from visivo.models.models.csv_script_model import CsvScriptModel
from visivo.models.models.local_merge_model import LocalMergeModel
from visivo.models.metric import Metric
from visivo.models.dimension import Dimension
from tests.factories.model_factories import SourceFactory


class TestSingleSourceValidator:
    """Tests for single source validation."""

    def test_metric_ties_back_to_single_source(self):
        """Test that all metric references tie back to a single source."""
        source = SourceFactory()
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
        )

        metric1 = Metric(name="total_revenue", expression="SUM(${ref(orders).amount})")
        metric2 = Metric(name="avg_revenue", expression="${ref(total_revenue)} / 100")

        # Should not raise - both metrics tie back to single source
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            metrics=[metric1, metric2],
            dashboards=[],
        )
        assert project is not None

    def test_dimension_ties_back_to_single_source(self):
        """Test that all dimension references tie back to a single source."""
        source = SourceFactory()
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
        )

        dim1 = Dimension(name="order_date", expression="${ref(orders).created_at}")
        dim2 = Dimension(name="order_year", expression="YEAR(${ref(order_date)})")

        # Should not raise - both dimensions tie back to single source
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            dimensions=[dim1, dim2],
            dashboards=[],
        )
        assert project is not None

    def test_metric_with_csv_model_has_no_source(self):
        """Test that metrics with CsvScriptModel have no source to validate."""
        csv_model = CsvScriptModel(
            name="data",
            table_name="data",
            args=["echo", "x,y\n1,2"],
        )

        metric = Metric(name="total_x", expression="SUM(${ref(data).x})")

        # CsvScriptModel has no source, so validation should fail
        with pytest.raises(ValueError) as exc_info:
            Project(
                name="test_project",
                models=[csv_model],
                metrics=[metric],
                dashboards=[],
            )

        assert "does not tie back to any source" in str(exc_info.value)

    def test_metric_ties_back_through_local_merge_model(self):
        """Test that metrics trace through LocalMergeModel to underlying source."""
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

        # Should not raise - metric traces through merge_model to base_model to source
        project = Project(
            name="test_project",
            sources=[source],
            models=[base_model, merge_model],
            metrics=[metric],
            dashboards=[],
        )
        assert project is not None

    def test_metric_referencing_multiple_sources_fails(self):
        """Test that a metric cannot reference multiple sources."""
        source1 = SourceFactory(name="source1")
        source2 = SourceFactory(name="source2")
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source1.name})",
        )
        users_model = SqlModel(
            name="users",
            sql="SELECT * FROM users",
            source=f"ref({source2.name})",
        )

        # This metric references models from different sources - should fail
        metric = Metric(
            name="bad_metric",
            expression="${ref(orders).amount} + ${ref(users).balance}",
        )

        with pytest.raises(ValueError) as exc_info:
            Project(
                name="test_project",
                sources=[source1, source2],
                models=[orders_model, users_model],
                metrics=[metric],
                dashboards=[],
            )

        assert "ties back to multiple sources" in str(exc_info.value)
        assert "source1" in str(exc_info.value)
        assert "source2" in str(exc_info.value)

    def test_dimension_referencing_multiple_sources_fails(self):
        """Test that a dimension cannot reference multiple sources."""
        source1 = SourceFactory(name="source1")
        source2 = SourceFactory(name="source2")
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source1.name})",
        )
        users_model = SqlModel(
            name="users",
            sql="SELECT * FROM users",
            source=f"ref({source2.name})",
        )

        # This dimension references models from different sources - should fail
        dimension = Dimension(
            name="bad_dimension",
            expression="${ref(orders).date} + ${ref(users).created_at}",
        )

        with pytest.raises(ValueError) as exc_info:
            Project(
                name="test_project",
                sources=[source1, source2],
                models=[orders_model, users_model],
                dimensions=[dimension],
                dashboards=[],
            )

        assert "ties back to multiple sources" in str(exc_info.value)
        assert "source1" in str(exc_info.value)
        assert "source2" in str(exc_info.value)

    def test_metric_without_source_fails(self):
        """Test that a metric must tie back to a source."""
        # Metric with no model reference
        metric = Metric(name="orphan_metric", expression="42")

        with pytest.raises(ValueError) as exc_info:
            Project(
                name="test_project",
                metrics=[metric],
                dashboards=[],
            )

        assert "does not tie back to any source" in str(exc_info.value)

    def test_dimension_without_source_fails(self):
        """Test that a dimension must tie back to a source."""
        # Dimension with no model reference
        dimension = Dimension(name="orphan_dimension", expression="42")

        with pytest.raises(ValueError) as exc_info:
            Project(
                name="test_project",
                dimensions=[dimension],
                dashboards=[],
            )

        assert "does not tie back to any source" in str(exc_info.value)

    def test_metric_chain_ties_to_single_source(self):
        """Test that a chain of metrics all tie back to the same source."""
        source = SourceFactory()
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
        )

        metric1 = Metric(name="revenue", expression="SUM(${ref(orders).amount})")
        metric2 = Metric(name="double_revenue", expression="${ref(revenue)} * 2")
        metric3 = Metric(name="triple_revenue", expression="${ref(double_revenue)} * 1.5")

        # Should not raise - all metrics in chain tie back to single source
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            metrics=[metric1, metric2, metric3],
            dashboards=[],
        )
        assert project is not None

    def test_metric_referencing_dimension_from_same_source(self):
        """Test metric referencing dimension where both tie to same source."""
        source = SourceFactory()
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
        )

        dimension = Dimension(name="order_year", expression="YEAR(${ref(orders).order_date})")
        metric = Metric(name="revenue_by_year", expression="SUM(${ref(orders).amount})")

        # Should not raise - both tie to same source
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            dimensions=[dimension],
            metrics=[metric],
            dashboards=[],
        )
        assert project is not None

    def test_nested_metric_ties_to_parent_model_source(self):
        """Test that nested metrics automatically tie to their parent model's source."""
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

        # Should not raise - nested metrics tie to parent model's source
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            dashboards=[],
        )
        assert project is not None
