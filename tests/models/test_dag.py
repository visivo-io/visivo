from visivo.models.base.named_model import NamedModel
from visivo.models.dag import family_tree_contains_named_node
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
