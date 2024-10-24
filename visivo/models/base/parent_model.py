import re
import click
from typing import List
from abc import ABC, abstractmethod
from visivo.models.base.base_model import BaseModel
from visivo.models.base.named_model import NamedModel
from pydantic_core import PydanticCustomError
from visivo.models.sources.source import DefaultSource


class ParentModel(ABC):
    @abstractmethod
    def child_items(self):
        return []

    def dag(self, node_permit_list=None):
        from networkx import DiGraph

        dag = DiGraph()
        dag.add_node(self)
        self.__build_dag(
            items=self.child_items(),
            parent_item=self,
            dag=dag,
            node_permit_list=node_permit_list,
            root=self,
        )
        self.__dereference_items(
            items=self.child_items(),
            parent_item=self,
            dag=dag,
            node_permit_list=node_permit_list,
            root=self,
        )
        return dag

    def __build_dag(self, items: List, parent_item, dag, node_permit_list, root):
        for item in items:
            if node_permit_list is None or item in node_permit_list:
                dag_item = item
                if item is None or BaseModel.is_ref(item):
                    continue
                elif isinstance(item, DefaultSource):
                    name = root.defaults.source_name
                    dag_item = self.__get_dereferenced_item(
                        name=name,
                        dag=dag,
                        root=root,
                        item=item,
                        parent_item=parent_item,
                    )
                dag.add_edge(parent_item, dag_item)
                if isinstance(dag_item, ParentModel):
                    self.__build_dag(
                        items=dag_item.child_items(),
                        parent_item=dag_item,
                        dag=dag,
                        node_permit_list=node_permit_list,
                        root=root,
                    )

    def __dereference_items(
        self, items: List, parent_item, dag, node_permit_list, root
    ):
        for item in items:
            if node_permit_list is None or item in node_permit_list:
                if BaseModel.is_ref(item):
                    name = NamedModel.get_name(obj=item)
                    dereferenced_item = self.__get_dereferenced_item(
                        name=name,
                        dag=dag,
                        root=root,
                        item=item,
                        parent_item=parent_item,
                    )
                    dag.add_edge(parent_item, dereferenced_item)
                if isinstance(item, ParentModel):
                    self.__dereference_items(
                        items=item.child_items(),
                        parent_item=item,
                        dag=dag,
                        node_permit_list=node_permit_list,
                        root=root,
                    )

    @staticmethod
    def all_descendants(dag, from_node=None, depth=None):
        import networkx.algorithms.traversal.depth_first_search as dfs

        return dfs.dfs_tree(dag, from_node, depth_limit=depth)

    def descendants(self):
        return ParentModel.all_descendants(dag=self.dag(), from_node=self)

    @staticmethod
    def all_descendants_of_type(type, dag, from_node=None, depth=None):
        if not depth:
            depth = len(dag)

        def find_type(item):
            return isinstance(item, type)

        return list(
            filter(
                find_type,
                ParentModel.all_descendants(dag=dag, from_node=from_node, depth=depth),
            )
        )

    def descendants_of_type(self, type):
        return ParentModel.all_descendants_of_type(
            type=type, dag=self.dag(), from_node=self
        )

    @staticmethod
    def all_descendants_with_name(name: str, dag, from_node=None):
        def find_name(item):
            return hasattr(item, "name") and item.name == name

        return list(
            filter(find_name, ParentModel.all_descendants(dag=dag, from_node=from_node))
        )

    def descendants_with_name(self, name: str):
        ParentModel.all_descendants_with_name(name=name, dag=self.dag(), from_node=self)

    @staticmethod
    def all_nodes_including_named_node_in_graph(name: str, dag):
        from networkx import descendants, ancestors

        item = ParentModel.all_descendants_with_name(name=name, dag=dag)

        if len(item) == 1:
            item = item[0]
        else:
            raise click.ClickException(f"No item found with name: '{name}'.")

        d = descendants(dag, item)
        a = ancestors(dag, item)
        items = d.union(a)
        items.add(item)
        return items

    def nodes_including_named_node_in_graph(self, name):
        return ParentModel.all_nodes_including_named_node_in_graph(
            name=name, dag=self.dag()
        )

    @staticmethod
    def filtered(pattern, objects) -> List:
        def name_match(trace):
            return re.search(pattern, trace.name)

        return list(filter(name_match, objects))

    def dag_dict(self):
        dag = self.dag()
        nodes = []
        edges = []

        for node in dag.nodes():
            if type(node) == str:
                breakpoint()
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

    def show_dag(self, dag=None):
        if dag is None:
            dag = self.dag()

        import plotly.graph_objects as go
        from networkx import shell_layout

        pos = shell_layout(dag)
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
                    arrowsize=2,
                    arrowwidth=1,
                    arrowcolor="#333",
                )
            )

        edge_trace = go.Scatter(
            x=edge_x,
            y=edge_y,
            line=dict(width=0.5, color="#333"),
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
                size=30,
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

    def __get_dereferenced_item(self, name, dag, root, item, parent_item):
        dereferenced_items = ParentModel.all_descendants_with_name(
            name=name, dag=dag, from_node=root
        )
        if len(dereferenced_items) == 1:
            return dereferenced_items[0]
        else:
            raise PydanticCustomError(
                "bad_reference",
                f'The reference "{item}" on item "{parent_item.id()}" does not point to an object.',
                parent_item.model_dump(),
            )
