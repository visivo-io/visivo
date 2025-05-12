from visivo.models.base.named_model import NamedModel
from visivo.models.dag import family_tree_contains_named_node, all_descendants
from networkx.algorithms.traversal.depth_first_search import dfs_tree
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


def test_all_descendants():
    dag = networkx.DiGraph()

    parent = Model(name="parent")
    child = Model(name="child")
    grandchild = Model(name="grandchild")
    dag.add_node(parent)
    dag.add_node(child)
    dag.add_node(grandchild)
    dag.add_edge(parent, child)
    dag.add_edge(child, grandchild)
    dfs = dfs_tree(dag, parent)
    assert set(all_descendants(dag, parent)) == set(dfs.nodes())
    dfs = dfs_tree(dag, child)
    assert set(all_descendants(dag, child)) == set(dfs.nodes())


def test_all_descendants_with_depth():
    dag = networkx.DiGraph()

    parent = Model(name="parent")
    child = Model(name="child")
    grandchild = Model(name="grandchild")
    dag.add_node(parent)
    dag.add_node(child)
    dag.add_node(grandchild)
    dag.add_edge(parent, child)
    dag.add_edge(child, grandchild)

    dfs = dfs_tree(dag, parent, depth_limit=1)
    assert set(all_descendants(dag, parent, 1)) == set(dfs.nodes())
    dfs = dfs_tree(dag, parent, depth_limit=2)
    assert set(all_descendants(dag, parent, 2)) == set(dfs.nodes())
    dfs = dfs_tree(dag, parent, depth_limit=3)
    assert set(all_descendants(dag, parent, 3)) == set(dfs.nodes())
