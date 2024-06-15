import re
import click
from typing import List
from abc import ABC, abstractmethod
from visivo.models.base.base_model import BaseModel
from visivo.models.base.named_model import NamedModel
import networkx as nx
import networkx.algorithms.traversal.depth_first_search as dfs
import matplotlib.pyplot as pyplot
from pydantic_core import PydanticCustomError
from visivo.models.targets.target import DefaultTarget


class ParentModel(ABC):
    @abstractmethod
    def child_items(self):
        return []

    def dag(self, node_permit_list=None):
        dag = nx.DiGraph()
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
                if BaseModel.is_ref(item):
                    continue
                elif isinstance(item, DefaultTarget):
                    name = root.defaults.target_name
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
    def all_descendants(dag, from_node=None):
        return dfs.dfs_tree(dag, from_node)

    def descendants(self):
        return ParentModel.all_descendants(dag=self.dag(), from_node=self)

    @staticmethod
    def all_descendants_of_type(type, dag, from_node=None):
        def find_type(item):
            return isinstance(item, type)

        return list(
            filter(find_type, ParentModel.all_descendants(dag=dag, from_node=from_node))
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
        item = ParentModel.all_descendants_with_name(name=name, dag=dag)

        if len(item) == 1:
            item = item[0]
        else:
            raise click.ClickException(f"No item found with name: '{name}'.")

        decendants = nx.descendants(dag, item)
        ancestors = nx.ancestors(dag, item)
        items = decendants.union(ancestors)
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

    @staticmethod
    def show_dag(dag):
        options = {}
        pos = nx.planar_layout(dag)
        nx.draw_networkx(dag, pos, **options)

        ax = pyplot.gca()
        ax.margins(0.20)
        pyplot.axis("off")
        pyplot.show()

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
