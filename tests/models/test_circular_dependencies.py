"""
Tests for circular dependency detection in metrics, dimensions, and relations.

This module tests that the DAG validator properly detects and reports
circular references between semantic layer objects.
"""

import pytest
from visivo.models.project import Project
from visivo.models.models.sql_model import SqlModel
from visivo.models.metric import Metric
from visivo.models.dimension import Dimension
from tests.factories.model_factories import SourceFactory, MetricFactory, DimensionFactory


class TestMetricCircularReferences:
    """Test circular dependency detection for metrics."""

    def test_direct_metric_cycle_raises_error(self):
        """Test that direct circular reference between two metrics is detected."""
        source = SourceFactory()
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
        )

        # Create circular reference: m1 -> m2 -> m1
        metric1 = Metric(name="m1", expression="${ref(m2)}")
        metric2 = Metric(name="m2", expression="${ref(m1)}")

        with pytest.raises(ValueError) as exc_info:
            Project(
                name="test_project",
                sources=[source],
                models=[model],
                metrics=[metric1, metric2],
                dashboards=[],
            )

        error_msg = str(exc_info.value)
        assert "circular reference" in error_msg.lower()
        # Should identify the cycle
        assert "m1" in error_msg
        assert "m2" in error_msg

    def test_indirect_metric_cycle_raises_error(self):
        """Test that indirect circular reference through chain is detected."""
        source = SourceFactory()
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
        )

        # Create cycle: m1 -> m2 -> m3 -> m1
        metric1 = Metric(name="m1", expression="${ref(m2)} + 1")
        metric2 = Metric(name="m2", expression="${ref(m3)} * 2")
        metric3 = Metric(name="m3", expression="${ref(m1)} - 5")

        with pytest.raises(ValueError) as exc_info:
            Project(
                name="test_project",
                sources=[source],
                models=[model],
                metrics=[metric1, metric2, metric3],
                dashboards=[],
            )

        error_msg = str(exc_info.value)
        assert "circular reference" in error_msg.lower()
        # Should mention all metrics in the cycle
        assert "m1" in error_msg
        assert "m2" in error_msg
        assert "m3" in error_msg

    def test_metric_self_reference_raises_error(self):
        """Test that a metric referencing itself is detected."""
        source = SourceFactory()
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
        )

        # Self-reference
        metric1 = Metric(name="m1", expression="${ref(m1)} + 1")

        with pytest.raises(ValueError) as exc_info:
            Project(
                name="test_project",
                sources=[source],
                models=[model],
                metrics=[metric1],
                dashboards=[],
            )

        error_msg = str(exc_info.value)
        assert "circular reference" in error_msg.lower()
        assert "m1" in error_msg

    def test_nested_metric_cannot_reference_global_metric_creating_cycle(self):
        """Test that nested metrics cannot create cycles with global metrics."""
        source = SourceFactory()

        # Global metric references nested metric
        global_metric = Metric(name="global_m", expression="${ref(orders).nested_m} * 2")

        # Nested metric tries to reference global metric (would create cycle)
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
            metrics=[
                Metric(name="nested_m", expression="SUM(amount)"),  # Valid
            ],
        )

        # This should work (no cycle yet)
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            metrics=[global_metric],
            dashboards=[],
        )
        assert project is not None

        # Now try to create nested metric that references global metric
        # This should fail during validation (nested metrics can't use ref())
        with pytest.raises(ValueError) as exc_info:
            model_with_cycle = SqlModel(
                name="orders2",
                sql="SELECT * FROM orders",
                source=f"ref({source.name})",
                metrics=[
                    Metric(
                        name="nested_m2", expression="${ref(global_m)} + 1"
                    ),  # Invalid - nested can't use ref()
                ],
            )

        # Should error about ref() syntax, not circular reference
        # (validation prevents the cycle from even being created)
        assert (
            "cannot use ref() syntax" in str(exc_info.value).lower()
            or "nested metric" in str(exc_info.value).lower()
        )

    def test_metric_chain_without_cycle_succeeds(self):
        """Test that valid metric chains without cycles work correctly."""
        source = SourceFactory()
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
        )

        # Valid chain: m1 -> m2 -> m3 (no cycle)
        metric1 = Metric(name="m1", expression="SUM(${ref(orders).amount})")
        metric2 = Metric(name="m2", expression="${ref(m1)} * 2")
        metric3 = Metric(name="m3", expression="${ref(m2)} + ${ref(m1)}")

        # Should not raise
        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            metrics=[metric1, metric2, metric3],
            dashboards=[],
        )
        assert project is not None


class TestDimensionCircularReferences:
    """Test circular dependency detection for dimensions."""

    def test_direct_dimension_cycle_raises_error(self):
        """Test that direct circular reference between two dimensions is detected."""
        source = SourceFactory()
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
        )

        # Create circular reference: d1 -> d2 -> d1
        dim1 = Dimension(name="d1", expression="${ref(d2)}")
        dim2 = Dimension(name="d2", expression="${ref(d1)}")

        with pytest.raises(ValueError) as exc_info:
            Project(
                name="test_project",
                sources=[source],
                models=[model],
                dimensions=[dim1, dim2],
                dashboards=[],
            )

        error_msg = str(exc_info.value)
        assert "circular reference" in error_msg.lower()
        assert "d1" in error_msg
        assert "d2" in error_msg

    def test_dimension_self_reference_raises_error(self):
        """Test that a dimension referencing itself is detected."""
        source = SourceFactory()
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
        )

        dim1 = Dimension(name="d1", expression="UPPER(${ref(d1)})")

        with pytest.raises(ValueError) as exc_info:
            Project(
                name="test_project",
                sources=[source],
                models=[model],
                dimensions=[dim1],
                dashboards=[],
            )

        error_msg = str(exc_info.value)
        assert "circular reference" in error_msg.lower()
        assert "d1" in error_msg


class TestMixedCircularReferences:
    """Test circular dependency detection across metrics and dimensions."""

    def test_metric_dimension_cycle_raises_error(self):
        """Test that circular reference between metric and dimension is detected."""
        source = SourceFactory()
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
        )

        # Create cycle: metric -> dimension -> metric
        metric = Metric(name="m", expression="SUM(${ref(d)})")
        dim = Dimension(name="d", expression="${ref(m)} * 2")

        with pytest.raises(ValueError) as exc_info:
            Project(
                name="test_project",
                sources=[source],
                models=[model],
                metrics=[metric],
                dimensions=[dim],
                dashboards=[],
            )

        error_msg = str(exc_info.value)
        assert "circular reference" in error_msg.lower()
        assert "m" in error_msg or "d" in error_msg

    def test_complex_mixed_cycle_raises_error(self):
        """Test complex cycle across metrics, dimensions, and models."""
        source = SourceFactory()
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
        )

        # Complex cycle: metric1 -> dim1 -> metric2 -> dim2 -> metric1
        metric1 = Metric(name="m1", expression="SUM(${ref(d1)})")
        dim1 = Dimension(name="d1", expression="${ref(m2)} * 2")
        metric2 = Metric(name="m2", expression="AVG(${ref(d2)})")
        dim2 = Dimension(name="d2", expression="${ref(m1)} / 2")

        with pytest.raises(ValueError) as exc_info:
            Project(
                name="test_project",
                sources=[source],
                models=[model],
                metrics=[metric1, metric2],
                dimensions=[dim1, dim2],
                dashboards=[],
            )

        error_msg = str(exc_info.value)
        assert "circular reference" in error_msg.lower()


class TestRelationCircularReferences:
    """Test that relations don't create problematic circular references."""

    def test_relations_do_not_create_dag_cycles(self):
        """Test that relations between models don't create DAG cycles.

        Relations define join conditions but don't create dependency cycles
        in the DAG since models don't depend on relations for execution.
        """
        source = SourceFactory()
        model_a = SqlModel(name="orders", sql="SELECT * FROM orders", source=f"ref({source.name})")
        model_b = SqlModel(name="users", sql="SELECT * FROM users", source=f"ref({source.name})")
        model_c = SqlModel(
            name="products", sql="SELECT * FROM products", source=f"ref({source.name})"
        )

        # Relations form a cycle in the relationship graph,
        # but this is OK because they don't create execution dependencies
        from visivo.models.relation import Relation

        rel_ab = Relation(name="ab", condition="${ref(orders).user_id} = ${ref(users).id}")
        rel_bc = Relation(name="bc", condition="${ref(users).product_id} = ${ref(products).id}")
        rel_ca = Relation(name="ca", condition="${ref(products).order_id} = ${ref(orders).id}")

        # Should not raise - relations don't create DAG cycles
        project = Project(
            name="test_project",
            sources=[source],
            models=[model_a, model_b, model_c],
            relations=[rel_ab, rel_bc, rel_ca],
            dashboards=[],
        )
        assert project is not None
        dag = project.dag()
        assert dag.validate_dag()


class TestNestedObjectCycles:
    """Test cycles involving nested metrics and dimensions within models."""

    def test_nested_metrics_cannot_create_cycles_within_model(self):
        """Test that nested metrics in same model cannot reference each other creating cycles.

        This should be caught because nested metrics can only reference parent model,
        not other metrics.
        """
        source = SourceFactory()

        # Nested metrics cannot use ref() syntax at all (should fail during validation)
        with pytest.raises(ValueError) as exc_info:
            model = SqlModel(
                name="orders",
                sql="SELECT * FROM orders",
                source=f"ref({source.name})",
                metrics=[
                    Metric(name="m1", expression="${ref(m2)} + 1"),  # Invalid ref() in nested
                ],
            )
            Project(
                name="test_project",
                sources=[source],
                models=[model],
                dashboards=[],
            )

        assert "cannot use ref() or refs. syntax" in str(exc_info.value).lower()
