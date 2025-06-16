import re
from typing import List, Tuple
from networkx import descendants, ancestors
from networkx.algorithms.traversal import depth_first_search


def create_dag_dict(dag):
    if not hasattr(dag, "get_root_nodes"):
        raise ValueError("DAG is not a ProjectDag")
    project = dag.get_root_nodes()[0]
    dag.remove_node(project)
    dag = dag.reverse()
    nodes = []
    edges = []

    for node in dag.nodes():

        node_data = {
            "id": str(id(node)),
            "name": node.name,
            "path": node.path,
            "type": type(node).__name__.lower(),
        }
        nodes.append(node_data)

    for edge in dag.edges():
        edge_data = {"source": str(id(edge[0])), "target": str(id(edge[1]))}
        edges.append(edge_data)

    return {"nodes": nodes, "edges": edges}


def all_descendants(dag, from_node=None, depth=None):
    if not from_node:
        return set(dag.nodes())

    if not depth:
        descendants_list = list(descendants(dag, from_node))
        descendants_list.append(from_node)
        return set(descendants_list)

    # depth_first_search.dfs_tree is slow, so it is only used when depth is not None
    return depth_first_search.dfs_tree(dag, from_node, depth_limit=depth)


def all_descendants_of_type(type, dag, from_node=None, depth=None):
    if not depth:
        depth = len(dag)

    def find_type(item):
        return isinstance(item, type)

    return list(
        filter(
            find_type,
            all_descendants(dag=dag, from_node=from_node, depth=depth),
        )
    )


def all_descendants_with_name(name: str, dag, from_node=None):
    def find_name(item):
        return hasattr(item, "name") and item.name == name

    return list(filter(find_name, all_descendants(dag=dag, from_node=from_node)))


def all_descendants_with_path_match(path: str, dag, from_node=None):
    def path_match(item):
        return hasattr(item, "path") and item.path and item.path in path

    return list(filter(path_match, all_descendants(dag=dag, from_node=from_node)))


def family_tree_contains_named_node(item, name: str, dag):
    d = descendants(dag, item)
    a = ancestors(dag, item)
    items = d.union(a)
    return any(item.name == name for item in items)


def all_nodes_including_named_node_in_graph(name: str, dag):
    import click

    item = all_descendants_with_name(name=name, dag=dag)

    if len(item) == 1:
        item = item[0]
    else:
        raise click.ClickException(f"No item found with name: '{name}'.")

    d = descendants(dag, item)
    a = ancestors(dag, item)
    items = d.union(a)
    items.add(item)
    return items


def parse_filter_str(filter_str) -> List[Tuple[str, str, str]]:
    pattern = r"((?P<pre>\d*\+)?\s*(?P<name>[a-zA-Z0-9\s'\"\-_]+)\s*(?P<post>\+\d*)?)(,|$)"
    matches = re.finditer(pattern, filter_str)

    filters = []
    for match in matches:
        filters.append((match.group("pre"), match.group("name"), match.group("post")))
    return filters
