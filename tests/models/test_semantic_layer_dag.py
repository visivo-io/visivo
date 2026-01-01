"""Tests for DAG generation with semantic layer objects (metrics, dimensions, relations)."""

import pytest
import networkx
from visivo.models.project import Project
from visivo.models.models.sql_model import SqlModel
from visivo.models.metric import Metric
from visivo.models.dimension import Dimension
from visivo.models.relation import Relation
from tests.factories.model_factories import ProjectFactory, SourceFactory


def test_nested_metric_references_parent_model():
    """Test that nested metrics create edges from metric to parent model."""
    source = SourceFactory()
    model = SqlModel(
        name="orders",
        sql="SELECT * FROM orders",
        source=f"ref({source.name})",
        metrics=[
            Metric(name="total_revenue", expression="SUM(amount)"),
        ],
    )
    project = Project(
        name="test_project",
        sources=[source],
        models=[model],
        dashboards=[],
    )

    dag = project.dag()

    # Verify DAG is valid
    assert networkx.is_directed_acyclic_graph(dag)

    # Verify nested metric references the parent model
    nested_metric = model.metrics[0]
    assert hasattr(nested_metric, "_parent_name")
    assert nested_metric._parent_name == "orders"

    # Verify child_items returns ref to parent
    children = nested_metric.child_items()
    assert children == ["${refs.orders}"]

    # Verify edge exists from metric to model in DAG (nested metric depends on parent model)
    assert dag.has_edge(nested_metric, model)


def test_nested_dimension_references_parent_model():
    """Test that nested dimensions create edges from dimension to parent model."""
    source = SourceFactory()
    model = SqlModel(
        name="orders",
        sql="SELECT * FROM orders",
        source=f"ref({source.name})",
        dimensions=[
            Dimension(name="order_month", expression="DATE_TRUNC('month', order_date)"),
        ],
    )
    project = Project(
        name="test_project",
        sources=[source],
        models=[model],
        dashboards=[],
    )

    dag = project.dag()

    # Verify DAG is valid
    assert networkx.is_directed_acyclic_graph(dag)

    # Verify nested dimension references the parent model
    nested_dimension = model.dimensions[0]
    assert hasattr(nested_dimension, "_parent_name")
    assert nested_dimension._parent_name == "orders"

    # Verify child_items returns ref to parent
    children = nested_dimension.child_items()
    assert children == ["${refs.orders}"]

    # Verify edge exists from dimension to model in DAG (nested dimension depends on parent model)
    assert dag.has_edge(nested_dimension, model)


def test_standalone_metric_extracts_model_references():
    """Test that standalone (project-level) metrics extract model references from expressions."""
    source = SourceFactory()
    orders_model = SqlModel(
        name="orders",
        sql="SELECT * FROM orders",
        source=f"ref({source.name})",
    )

    # Standalone metric references single model
    standalone_metric = Metric(
        name="total_revenue",
        expression="SUM(${ref(orders).amount})",
    )

    project = Project(
        name="test_project",
        sources=[source],
        models=[orders_model],
        metrics=[standalone_metric],
        dashboards=[],
    )

    dag = project.dag()

    # Verify DAG is valid
    assert networkx.is_directed_acyclic_graph(dag)

    # Verify standalone metric has no parent name
    assert not hasattr(standalone_metric, "_parent_name") or standalone_metric._parent_name is None

    # Verify child_items extracts model reference
    children = standalone_metric.child_items()
    assert set(children) == {"${refs.orders}"}

    # Verify edge exists from metric to model (metric depends on model)
    assert dag.has_edge(standalone_metric, orders_model)


def test_standalone_dimension_extracts_model_references():
    """Test that standalone (project-level) dimensions extract model references from expressions."""
    source = SourceFactory()
    orders_model = SqlModel(
        name="orders",
        sql="SELECT * FROM orders",
        source=f"ref({source.name})",
    )

    # Standalone dimension references a model
    standalone_dimension = Dimension(
        name="order_year",
        expression="DATE_TRUNC('year', ${ref(orders).order_date})",
    )

    project = Project(
        name="test_project",
        sources=[source],
        models=[orders_model],
        dimensions=[standalone_dimension],
        dashboards=[],
    )

    dag = project.dag()

    # Verify DAG is valid
    assert networkx.is_directed_acyclic_graph(dag)

    # Verify standalone dimension has no parent name
    assert (
        not hasattr(standalone_dimension, "_parent_name")
        or standalone_dimension._parent_name is None
    )

    # Verify child_items extracts model reference
    children = standalone_dimension.child_items()
    assert children == ["${refs.orders}"]

    # Verify edge exists from dimension to model (dimension depends on model)
    assert dag.has_edge(standalone_dimension, orders_model)


def test_relation_extracts_model_references():
    """Test that relations extract model references from conditions."""
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

    project = Project(
        name="test_project",
        sources=[source],
        models=[orders_model, users_model],
        relations=[relation],
        dashboards=[],
    )

    dag = project.dag()

    # Verify DAG is valid
    assert networkx.is_directed_acyclic_graph(dag)

    # Verify child_items extracts both model references
    children = relation.child_items()
    assert set(children) == {"${refs.orders}", "${refs.users}"}

    # Verify edges exist from relation to both models (relation depends on both models)
    assert dag.has_edge(relation, orders_model)
    assert dag.has_edge(relation, users_model)


def test_nested_metric_cannot_use_ref_syntax():
    """Test that nested metrics cannot use ref() syntax in expressions."""
    source = SourceFactory()

    with pytest.raises(ValueError) as exc_info:
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
            metrics=[
                Metric(name="bad_metric", expression="${ref(other_model).field}"),
            ],
        )
        Project(
            name="test_project",
            sources=[source],
            models=[model],
            dashboards=[],
        )

    assert "cannot use ref() or refs. syntax" in str(exc_info.value)
    assert "bad_metric" in str(exc_info.value)
    assert "orders" in str(exc_info.value)


def test_nested_dimension_cannot_use_ref_syntax():
    """Test that nested dimensions cannot use ref() syntax in expressions."""
    source = SourceFactory()

    with pytest.raises(ValueError) as exc_info:
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
            dimensions=[
                Dimension(name="bad_dimension", expression="${ref(other_model).field}"),
            ],
        )
        Project(
            name="test_project",
            sources=[source],
            models=[model],
            dashboards=[],
        )

    assert "cannot use ref() or refs. syntax" in str(exc_info.value)
    assert "bad_dimension" in str(exc_info.value)
    assert "orders" in str(exc_info.value)


def test_mixed_nested_and_standalone_metrics():
    """Test project with both nested and standalone metrics."""
    source = SourceFactory()

    # Model with nested metrics
    orders_model = SqlModel(
        name="orders",
        sql="SELECT * FROM orders",
        source=f"ref({source.name})",
        metrics=[
            Metric(name="total_revenue", expression="SUM(amount)"),
            Metric(name="avg_revenue", expression="AVG(amount)"),
        ],
    )

    # Standalone metric referencing nested metric from same model
    standalone_metric = Metric(
        name="double_revenue",
        expression="${ref(orders).total_revenue} * 2",
    )

    project = Project(
        name="test_project",
        sources=[source],
        models=[orders_model],
        metrics=[standalone_metric],
        dashboards=[],
    )

    dag = project.dag()

    # Verify DAG is valid
    assert networkx.is_directed_acyclic_graph(dag)

    # Verify nested metrics reference their parent model
    assert orders_model.metrics[0]._parent_name == "orders"
    assert orders_model.metrics[1]._parent_name == "orders"

    # Verify standalone metric references the model
    standalone_children = standalone_metric.child_items()
    assert set(standalone_children) == {"${refs.orders}"}

    # Verify edges (nested metrics depend on their parent model)
    assert dag.has_edge(orders_model.metrics[0], orders_model)
    assert dag.has_edge(orders_model.metrics[1], orders_model)
    # Standalone metric depends on the model
    assert dag.has_edge(standalone_metric, orders_model)


def test_standalone_metric_with_refs_syntax():
    """Test that standalone metrics work with new ${refs.name} syntax."""
    source = SourceFactory()
    orders_model = SqlModel(
        name="orders",
        sql="SELECT * FROM orders",
        source=f"ref({source.name})",
    )

    # Standalone metric using new ${refs.name} syntax
    standalone_metric = Metric(
        name="total_revenue",
        expression="SUM(${refs.orders.amount})",
    )

    project = Project(
        name="test_project",
        sources=[source],
        models=[orders_model],
        metrics=[standalone_metric],
        dashboards=[],
    )

    dag = project.dag()

    # Verify DAG is valid
    assert networkx.is_directed_acyclic_graph(dag)

    # Verify child_items extracts model reference from refs syntax
    children = standalone_metric.child_items()
    assert set(children) == {"${refs.orders}"}

    # Verify edge exists from metric to model
    assert dag.has_edge(standalone_metric, orders_model)


def test_standalone_dimension_with_refs_syntax():
    """Test that standalone dimensions work with new ${refs.name} syntax."""
    source = SourceFactory()
    orders_model = SqlModel(
        name="orders",
        sql="SELECT * FROM orders",
        source=f"ref({source.name})",
    )

    # Standalone dimension using new ${refs.name} syntax
    standalone_dimension = Dimension(
        name="order_year",
        expression="DATE_TRUNC('year', ${refs.orders.order_date})",
    )

    project = Project(
        name="test_project",
        sources=[source],
        models=[orders_model],
        dimensions=[standalone_dimension],
        dashboards=[],
    )

    dag = project.dag()

    # Verify DAG is valid
    assert networkx.is_directed_acyclic_graph(dag)

    # Verify child_items extracts model reference from refs syntax
    children = standalone_dimension.child_items()
    assert children == ["${refs.orders}"]

    # Verify edge exists from dimension to model
    assert dag.has_edge(standalone_dimension, orders_model)


def test_metric_referencing_another_metric_with_refs_syntax():
    """Test that metrics can reference other metrics using new ${refs.name} syntax."""
    source = SourceFactory()
    orders_model = SqlModel(
        name="orders",
        sql="SELECT * FROM orders",
        source=f"ref({source.name})",
        metrics=[
            Metric(name="total_revenue", expression="SUM(amount)"),
        ],
    )

    # Composite metric referencing another metric via model
    composite_metric = Metric(
        name="double_revenue",
        expression="${refs.orders.total_revenue} * 2",
    )

    project = Project(
        name="test_project",
        sources=[source],
        models=[orders_model],
        metrics=[composite_metric],
        dashboards=[],
    )

    dag = project.dag()

    # Verify DAG is valid
    assert networkx.is_directed_acyclic_graph(dag)

    # Verify child_items extracts the model reference
    children = composite_metric.child_items()
    assert set(children) == {"${refs.orders}"}

    # Verify edge exists from composite metric to model
    assert dag.has_edge(composite_metric, orders_model)
