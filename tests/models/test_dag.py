from visivo.models.base.named_model import NamedModel
from visivo.models.dag import family_tree_contains_named_node, filter_dag
from tests.factories.model_factories import SqlModelFactory, TraceFactory
import networkx


class Model(NamedModel):
    pass


def test_family_tree_contains_named_node():
    dag = networkx.DiGraph()

    parent = Model(name="parent")
    model = Model(name="model")
    child = Model(name="child")
    dag.add_node(parent)
    dag.add_edge(parent, model)
    dag.add_edge(model, child)
    assert family_tree_contains_named_node(model, "parent", dag) is True
    assert family_tree_contains_named_node(model, "child", dag) is True
    assert family_tree_contains_named_node(model, "non_existent", dag) is False


def test_filter_dag():
    dag = networkx.DiGraph()

    grandparent = Model(name="grandparent")
    parent = Model(name="parent")
    model = Model(name="model")
    child = Model(name="child")
    grandchild = Model(name="grandchild")
    dag.add_node(grandparent)
    dag.add_edge(grandparent, parent)
    dag.add_edge(parent, model)
    dag.add_edge(model, child)
    dag.add_edge(child, grandchild)

    filtered_dag = filter_dag(dag, "1+model+1")
    assert len(filtered_dag.nodes) == 3
    assert len(filtered_dag.edges) == 2

    filtered_dag = filter_dag(dag, "2+model+1")
    assert len(filtered_dag.nodes) == 4
    assert len(filtered_dag.edges) == 3

    filtered_dag = filter_dag(dag, "+model+1")
    assert len(filtered_dag.nodes) == 4
    assert len(filtered_dag.edges) == 3

    filtered_dag = filter_dag(dag, "1+model+")
    assert len(filtered_dag.nodes) == 4
    assert len(filtered_dag.edges) == 3

    filtered_dag = filter_dag(dag, "model+")
    assert len(filtered_dag.nodes) == 3
    assert len(filtered_dag.edges) == 2

    filtered_dag = filter_dag(dag, "model")
    assert len(filtered_dag.nodes) == 1
    assert len(filtered_dag.edges) == 0
