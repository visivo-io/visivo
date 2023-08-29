import re
import click
from typing import List
from abc import ABC, abstractmethod
from visivo.models.base.base_model import BaseModel
from visivo.models.base.named_model import NamedModel
import networkx as nx
import networkx.algorithms.traversal.depth_first_search as dfs
import matplotlib.pyplot as pyplot


class ParentModel(ABC):
    @abstractmethod
    def child_items(self):
        return []

    def dag(self):
        dag = nx.DiGraph()
        dag.add_node(self)
        self.traverse_fields(items=self.child_items(), parent_item=self, dag=dag)
        return dag

    def traverse_fields(self, items: List, parent_item, dag):
        for item in items:
            dereferenced_item = item
            if BaseModel.is_ref(item):
                name = NamedModel.get_name(obj=item)
                dereferenced_items = ParentModel.all_descendants_with_name(
                    name=name, dag=dag
                )
                if len(dereferenced_items) == 1:
                    dereferenced_item = dereferenced_items[0]
                else:
                    raise ValueError(
                        f'The reference "{item}" on item "{parent_item.id()}" does not point to an object.'
                    )

            dag.add_edge(parent_item, dereferenced_item)
            if isinstance(dereferenced_item, ParentModel):
                self.traverse_fields(
                    items=dereferenced_item.child_items(),
                    parent_item=dereferenced_item,
                    dag=dag,
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

    def descendants_of_type(self, type, from_node=None):
        return ParentModel.all_descendants_of_type(
            type=type, dag=self.dag(), from_node=from_node
        )

    @staticmethod
    def all_descendants_with_name(name: str, dag):
        def find_name(item):
            return hasattr(item, "name") and item.name == name

        return list(filter(find_name, ParentModel.all_descendants(dag=dag)))

    def descendants_with_name(self, name: str):
        ParentModel.all_descendants_with_name(name=name, dag=self.dag())

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
