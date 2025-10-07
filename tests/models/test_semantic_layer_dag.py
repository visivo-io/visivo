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
    assert children == ["ref(orders)"]

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
    assert children == ["ref(orders)"]

    # Verify edge exists from dimension to model in DAG (nested dimension depends on parent model)
    assert dag.has_edge(nested_dimension, model)


def test_standalone_metric_extracts_model_references():
    """Test that standalone (project-level) metrics extract model references from expressions."""
    source = SourceFactory()
    orders_model = SqlModel(
        name="orders",
        sql="SELECT * FROM orders",
        source=f"ref({source.name})",
        metrics=[Metric(name="total_revenue", expression="SUM(amount)")],
    )
    users_model = SqlModel(
        name="users",
        sql="SELECT * FROM users",
        source=f"ref({source.name})",
        metrics=[Metric(name="total_users", expression="COUNT(DISTINCT id)")],
    )

    # Standalone metric references both models
    standalone_metric = Metric(
        name="revenue_per_user",
        expression="${ref(orders).total_revenue} / ${ref(users).total_users}",
    )

    project = Project(
        name="test_project",
        sources=[source],
        models=[orders_model, users_model],
        metrics=[standalone_metric],
        dashboards=[],
    )

    dag = project.dag()

    # Verify DAG is valid
    assert networkx.is_directed_acyclic_graph(dag)

    # Verify standalone metric has no parent name
    assert not hasattr(standalone_metric, "_parent_name") or standalone_metric._parent_name is None

    # Verify child_items extracts model references
    children = standalone_metric.child_items()
    assert set(children) == {"ref(orders)", "ref(users)"}

    # Verify edges exist from metric to both models (metric depends on both models)
    assert dag.has_edge(standalone_metric, orders_model)
    assert dag.has_edge(standalone_metric, users_model)


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
    assert children == ["ref(orders)"]

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
    assert set(children) == {"ref(orders)", "ref(users)"}

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

    assert "cannot use ref() syntax" in str(exc_info.value)
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

    assert "cannot use ref() syntax" in str(exc_info.value)
    assert "bad_dimension" in str(exc_info.value)
    assert "orders" in str(exc_info.value)


def test_mixed_nested_and_standalone_metrics():
    """Test project with both nested and standalone metrics."""
    source = SourceFactory()

    # Model with nested metric
    orders_model = SqlModel(
        name="orders",
        sql="SELECT * FROM orders",
        source=f"ref({source.name})",
        metrics=[
            Metric(name="total_revenue", expression="SUM(amount)"),
        ],
    )

    # Another model with nested metric
    users_model = SqlModel(
        name="users",
        sql="SELECT * FROM users",
        source=f"ref({source.name})",
        metrics=[
            Metric(name="user_count", expression="COUNT(*)"),
        ],
    )

    # Standalone metric referencing nested metrics
    standalone_metric = Metric(
        name="revenue_per_user",
        expression="${ref(orders).total_revenue} / ${ref(users).user_count}",
    )

    project = Project(
        name="test_project",
        sources=[source],
        models=[orders_model, users_model],
        metrics=[standalone_metric],
        dashboards=[],
    )

    dag = project.dag()

    # Verify DAG is valid
    assert networkx.is_directed_acyclic_graph(dag)

    # Verify nested metrics reference their parent models
    assert orders_model.metrics[0]._parent_name == "orders"
    assert users_model.metrics[0]._parent_name == "users"

    # Verify standalone metric references both models (not the nested metrics directly)
    standalone_children = standalone_metric.child_items()
    assert set(standalone_children) == {"ref(orders)", "ref(users)"}

    # Verify edges (nested metrics depend on their parent models)
    assert dag.has_edge(orders_model.metrics[0], orders_model)
    assert dag.has_edge(users_model.metrics[0], users_model)
    # Standalone metric depends on both models
    assert dag.has_edge(standalone_metric, orders_model)
    assert dag.has_edge(standalone_metric, users_model)
