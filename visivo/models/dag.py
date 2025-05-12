import re
from typing import List, Tuple
from networkx import descendants, ancestors
from networkx.algorithms.traversal import depth_first_search


def show_dag_fig(dag):
    import plotly.graph_objects as go

    from networkx import random_layout

    pos = random_layout(dag)
    edge_x = []
    edge_y = []
    edge_annotations = []

    for edge in dag.edges():
        x0, y0 = pos[edge[0]]
        x1, y1 = pos[edge[1]]
        edge_x.append(x0)
        edge_x.append(x1)
        edge_x.append(None)
        edge_y.append(y0)
        edge_y.append(y1)
        edge_y.append(None)
        edge_annotations.append(
            dict(
                ax=x0,
                ay=y0,
                axref="x",
                ayref="y",
                x=x1,
                y=y1,
                xref="x",
                yref="y",
                showarrow=True,
                arrowhead=2,
                arrowsize=1,
                arrowwidth=1,
                arrowcolor="#888",
            )
        )

    edge_trace = go.Scatter(
        x=edge_x,
        y=edge_y,
        line=dict(width=0.5, color="#888"),
        hoverinfo="none",
        mode="lines",
    )

    node_x = []
    node_y = []
    node_text = []
    for node in dag.nodes():
        x, y = pos[node]
        node_x.append(x)
        node_y.append(y)
        node_text.append(str(node))

    node_trace = go.Scatter(
        x=node_x,
        y=node_y,
        mode="markers+text",
        hoverinfo="text",
        text=node_text,
        marker=dict(
            showscale=True,
            colorscale="YlGnBu",
            size=10,
            colorbar=dict(
                thickness=15,
                title="Node Connections",
                xanchor="left",
                titleside="right",
            ),
        ),
    )

    fig = go.Figure(
        data=[edge_trace, node_trace],
        layout=go.Layout(
            showlegend=False,
            hovermode="closest",
            margin=dict(b=20, l=5, r=5, t=40),
            xaxis=dict(showgrid=False, zeroline=False),
            yaxis=dict(showgrid=False, zeroline=False),
            annotations=edge_annotations,
        ),
    )
    fig.show()


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
