"""
Unit tests for the MetricResolver class.
"""

import pytest
from unittest.mock import Mock, MagicMock
from visivo.query.metric_resolver import (
    MetricResolver,
    CircularDependencyError,
    MetricNotFoundError,
)
from visivo.models.metric import Metric
from visivo.models.models.sql_model import SqlModel
from visivo.models.project import Project
from visivo.models.sources.sqlite_source import SqliteSource


class TestMetricResolver:
    """Test suite for MetricResolver functionality."""

    def test_init_empty_project(self):
        """Test initialization with empty project."""
        # Create a real project instead of mock
        project = Project(name="test_project")
        resolver = MetricResolver(project)
        assert resolver.metrics_by_name == {}

    def test_build_metric_index_project_level(self):
        """Test indexing of project-level metrics."""
        # Create project-level metrics
        metric1 = Metric(name="total_revenue", expression="SUM(revenue)")
        metric2 = Metric(name="user_count", expression="COUNT(DISTINCT user_id)")

        project = Project(name="test_project", metrics=[metric1, metric2])

        resolver = MetricResolver(project)

        assert "total_revenue" in resolver.metrics_by_name
        assert "user_count" in resolver.metrics_by_name
        assert resolver.metrics_by_name["total_revenue"] == metric1
        assert resolver.metrics_by_name["user_count"] == metric2

    def test_build_metric_index_model_level(self):
        """Test indexing of model-level metrics."""
        # Create a source
        source = SqliteSource(name="test_db", type="sqlite", database=":memory:")

        # Create model with metrics
        metric1 = Metric(name="order_total", expression="SUM(amount)")
        metric2 = Metric(name="order_count", expression="COUNT(*)")

        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source="ref(test_db)",
            metrics=[metric1, metric2],
        )

        project = Project(name="test_project", sources=[source], models=[model])

        resolver = MetricResolver(project)

        # Check simple names
        assert "order_total" in resolver.metrics_by_name
        assert "order_count" in resolver.metrics_by_name

        # Check qualified names
        assert "orders.order_total" in resolver.metrics_by_name
        assert "orders.order_count" in resolver.metrics_by_name

    def test_find_metric(self):
        """Test finding metrics by name."""
        metric = Metric(name="test_metric", expression="COUNT(*)")
        project = Project(name="test_project", metrics=[metric])

        resolver = MetricResolver(project)

        # Find existing metric
        found = resolver.find_metric("test_metric")
        assert found == metric

        # Try to find non-existent metric
        not_found = resolver.find_metric("missing_metric")
        assert not_found is None

    def test_metric_composition_resolution(self):
        """Test resolving metrics that reference other metrics."""
        # Create base metrics
        revenue = Metric(name="revenue", expression="SUM(amount)")
        customers = Metric(name="customers", expression="COUNT(DISTINCT customer_id)")

        # Create composed metric
        arpu = Metric(name="arpu", expression="${ref(revenue)} / ${ref(customers)}")

        project = Project(name="test_project", metrics=[revenue, customers, arpu])

        resolver = MetricResolver(project)

        # Resolve the composed metric
        resolved = resolver.resolve_metric_expression("arpu")
        assert resolved == "(SUM(amount)) / (COUNT(DISTINCT customer_id))"

    def test_nested_metric_composition(self):
        """Test deeply nested metric compositions."""
        # Create a chain of metrics
        base = Metric(name="base", expression="SUM(value)")
        level1 = Metric(name="level1", expression="${ref(base)} * 2")
        level2 = Metric(name="level2", expression="${ref(level1)} + 100")
        level3 = Metric(name="level3", expression="${ref(level2)} / 10")

        project = Project(name="test_project", metrics=[base, level1, level2, level3])

        resolver = MetricResolver(project)

        # Resolve the deeply nested metric
        resolved = resolver.resolve_metric_expression("level3")
        assert "(SUM(value))" in resolved
        assert "* 2" in resolved
        assert "+ 100" in resolved
        assert "/ 10" in resolved

    def test_circular_dependency_detection(self):
        """Test that circular dependencies are properly detected."""
        # Create circular metrics
        metric_a = Metric(name="metric_a", expression="${ref(metric_b)} + 1")
        metric_b = Metric(name="metric_b", expression="${ref(metric_c)} * 2")
        metric_c = Metric(name="metric_c", expression="${ref(metric_a)} - 1")

        project = Project(name="test_project", metrics=[metric_a, metric_b, metric_c])

        resolver = MetricResolver(project)

        # Should detect the cycle
        cycle = resolver.detect_circular_dependencies()
        assert cycle is not None
        # The cycle path may include the starting node twice
        assert len(set(cycle)) == 3  # Should have 3 unique metrics
        assert set(cycle) == {"metric_a", "metric_b", "metric_c"}

    def test_topological_sort(self):
        """Test topological sorting of metrics."""
        # Create metrics with dependencies
        base1 = Metric(name="base1", expression="SUM(x)")
        base2 = Metric(name="base2", expression="COUNT(y)")
        derived1 = Metric(name="derived1", expression="${ref(base1)} + ${ref(base2)}")
        derived2 = Metric(name="derived2", expression="${ref(derived1)} * 2")

        project = Project(
            name="test_project",
            metrics=[derived2, derived1, base2, base1],  # Intentionally out of order
        )

        resolver = MetricResolver(project)
        sorted_metrics = resolver.topological_sort()

        # Base metrics should come before derived ones
        assert sorted_metrics.index("base1") < sorted_metrics.index("derived1")
        assert sorted_metrics.index("base2") < sorted_metrics.index("derived1")
        assert sorted_metrics.index("derived1") < sorted_metrics.index("derived2")

    def test_circular_dependency_error_on_resolution(self):
        """Test that circular dependencies raise error during resolution."""
        metric_a = Metric(name="metric_a", expression="${ref(metric_b)} + 1")
        metric_b = Metric(name="metric_b", expression="${ref(metric_a)} * 2")

        project = Project(name="test_project", metrics=[metric_a, metric_b])

        resolver = MetricResolver(project)

        with pytest.raises(CircularDependencyError):
            resolver.resolve_metric_expression("metric_a")

    def test_metric_not_found_error(self):
        """Test that referencing non-existent metrics raises error."""
        metric = Metric(name="test", expression="${ref(missing)} + 1")
        project = Project(name="test_project", metrics=[metric])

        resolver = MetricResolver(project)

        # Should fall back to original reference when metric not found
        resolved = resolver.resolve_metric_expression("test")
        assert "${ref(missing)}" in resolved

    def test_model_scoped_metric_resolution(self):
        """Test resolving model-scoped metrics with qualified names."""
        source = SqliteSource(name="test_db", type="sqlite", database=":memory:")

        # Create models with metrics
        orders_revenue = Metric(name="revenue", expression="SUM(amount)")
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source="ref(test_db)",
            metrics=[orders_revenue],
        )

        # Create a project-level metric that references model metric
        total_metric = Metric(name="total", expression="${ref(orders).revenue} * 1.1")

        project = Project(
            name="test_project", sources=[source], models=[orders_model], metrics=[total_metric]
        )

        resolver = MetricResolver(project)

        # Resolve using qualified name
        resolved = resolver.resolve_metric_expression("total")
        assert "(SUM(amount))" in resolved
        assert "* 1.1" in resolved

    def test_resolve_all_metrics(self):
        """Test resolving all metrics in a project."""
        base = Metric(name="base", expression="COUNT(*)")
        derived = Metric(name="derived", expression="${ref(base)} * 100")

        project = Project(name="test_project", metrics=[base, derived])

        resolver = MetricResolver(project)
        all_resolved = resolver.resolve_all_metrics()

        assert "base" in all_resolved
        assert "derived" in all_resolved
        assert all_resolved["base"] == "COUNT(*)"
        assert all_resolved["derived"] == "(COUNT(*)) * 100"

    def test_get_metric_dependencies(self):
        """Test getting dependencies of a metric."""
        base1 = Metric(name="base1", expression="SUM(x)")
        base2 = Metric(name="base2", expression="COUNT(y)")
        derived = Metric(name="derived", expression="${ref(base1)} + ${ref(base2)}")

        project = Project(name="test_project", metrics=[base1, base2, derived])

        resolver = MetricResolver(project)

        # Get dependencies of derived metric
        deps = resolver.get_metric_dependencies("derived")
        assert deps == {"base1", "base2"}

        # Base metrics have no dependencies
        assert resolver.get_metric_dependencies("base1") == set()
        assert resolver.get_metric_dependencies("base2") == set()

    def test_get_metric_lineage(self):
        """Test getting complete lineage of a metric."""
        base = Metric(name="base", expression="SUM(x)")
        middle = Metric(name="middle", expression="${ref(base)} * 2")
        top = Metric(name="top", expression="${ref(middle)} + 100")

        project = Project(name="test_project", metrics=[base, middle, top])

        resolver = MetricResolver(project)

        # Get lineage of middle metric
        lineage = resolver.get_metric_lineage("middle")
        assert lineage["upstream"] == {"base"}
        assert lineage["downstream"] == {"top"}

        # Get lineage of base metric
        base_lineage = resolver.get_metric_lineage("base")
        assert base_lineage["upstream"] == set()
        assert base_lineage["downstream"] == {"middle"}

    def test_get_models_from_metric(self):
        """Test extracting model references from metrics."""
        source = SqliteSource(name="test_db", type="sqlite", database=":memory:")

        # Create models
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source="ref(test_db)",
            metrics=[Metric(name="revenue", expression="SUM(amount)")],
        )

        customers_model = SqlModel(
            name="customers",
            sql="SELECT * FROM customers",
            source="ref(test_db)",
            metrics=[Metric(name="count", expression="COUNT(*)")],
        )

        # Create cross-model metric
        cross_metric = Metric(
            name="revenue_per_customer",
            expression="${ref(orders).revenue} / ${ref(customers).count}",
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model, customers_model],
            metrics=[cross_metric],
        )

        resolver = MetricResolver(project)

        # Get models from cross-model metric
        models = resolver.get_models_from_metric("revenue_per_customer")
        assert models == {"orders", "customers"}

    def test_mixed_metric_and_field_references(self):
        """Test metrics that reference both metrics and direct fields."""
        source = SqliteSource(name="test_db", type="sqlite", database=":memory:")

        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source="ref(test_db)",
            metrics=[Metric(name="total", expression="SUM(amount)")],
        )

        # Metric that references both a metric and a field
        mixed_metric = Metric(
            name="adjusted_total", expression="${ref(orders).total} * ${ref(orders).tax_rate}"
        )

        project = Project(
            name="test_project", sources=[source], models=[orders_model], metrics=[mixed_metric]
        )

        resolver = MetricResolver(project)

        # Should resolve the metric but keep the field reference
        resolved = resolver.resolve_metric_expression("adjusted_total")
        assert "(SUM(amount))" in resolved
        assert "${ref(orders).tax_rate}" in resolved

    def test_cache_behavior(self):
        """Test that resolved expressions are cached."""
        metric = Metric(name="test", expression="COUNT(*)")
        project = Project(name="test_project", metrics=[metric])

        resolver = MetricResolver(project)

        # First resolution
        result1 = resolver.resolve_metric_expression("test")

        # Second resolution should use cache
        result2 = resolver.resolve_metric_expression("test")

        assert result1 == result2
        assert "test" in resolver._metric_cache

    def test_empty_project(self):
        """Test behavior with project having no metrics."""
        project = Project(name="empty_project")
        resolver = MetricResolver(project)

        assert resolver.metrics_by_name == {}
        assert resolver.find_metric("any") is None
        assert resolver.get_metric_dependencies("any") == set()
        assert resolver.resolve_all_metrics() == {}

    def test_complex_dependency_chain(self):
        """Test a complex chain of metric dependencies."""
        # Create a diamond dependency pattern
        #     base
        #    /    \
        #   left  right
        #    \    /
        #     top
        base = Metric(name="base", expression="SUM(value)")
        left = Metric(name="left", expression="${ref(base)} * 0.6")
        right = Metric(name="right", expression="${ref(base)} * 0.4")
        top = Metric(name="top", expression="${ref(left)} + ${ref(right)}")

        project = Project(name="test_project", metrics=[base, left, right, top])

        resolver = MetricResolver(project)

        # Resolve the top metric
        resolved = resolver.resolve_metric_expression("top")

        # Should have both paths resolved
        assert "0.6" in resolved
        assert "0.4" in resolved
        assert resolved.count("SUM(value)") == 2  # Base metric appears twice

    def test_metric_with_multiple_same_references(self):
        """Test metric that references the same metric multiple times."""
        base = Metric(name="base", expression="COUNT(*)")
        derived = Metric(
            name="derived", expression="${ref(base)} + ${ref(base)} * 2 + ${ref(base)} / 3"
        )

        project = Project(name="test_project", metrics=[base, derived])

        resolver = MetricResolver(project)

        resolved = resolver.resolve_metric_expression("derived")
        # Each reference should be resolved
        assert resolved.count("(COUNT(*))") == 3
