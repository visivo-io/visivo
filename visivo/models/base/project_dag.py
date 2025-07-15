import json
import re
from networkx import DiGraph, simple_cycles, is_directed_acyclic_graph
from visivo.models.dag import all_descendants_with_name, parse_filter_str
from typing import List, Optional


class ProjectDag(DiGraph):
    """
    Custom implementation of a DiGraph that adds additional methods for validation & data extraction.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._named_nodes_subgraph = None

    def get_named_nodes_subgraph(self):
        """Creates the named nodes subgraph if it doesn't exist"""
        if self._named_nodes_subgraph is None:
            self._named_nodes_subgraph = self.__compute_named_nodes_subgraph()
        return self._named_nodes_subgraph

    def validate_dag(self):
        if is_directed_acyclic_graph(self):
            return True

        circular_references = list(simple_cycles(self))
        if len(circular_references) > 0:
            circle = " -> ".join(list(map(lambda cr: cr.id(), circular_references[0])))
            circle += f" -> {circular_references[0][0].id()}."
            raise ValueError(f"Project contains a circular reference: {circle}")
        raise ValueError("Project is not a valid DAG.")

    def get_root_nodes(self):
        roots = [node for node, deg in self.in_degree() if deg == 0]
        return roots

    def get_node_by_path(self, path):
        for node in self.nodes():
            if hasattr(node, "path"):
                if node.path == path:
                    return node
        raise ValueError(f"Item with path {path} not found.")

    def get_node_by_name(self, name):
        for node in self.nodes():
            if hasattr(node, "name"):
                if node.name == name:
                    return node
        raise ValueError(f"Item with name {name} not found.")

    def get_nodes_by_types(self, types: List, is_named=Optional[bool]):
        nodes = []

        def node_match(node, type) -> bool:
            if not isinstance(node, type):
                return False
            if is_named is None:
                return True
            elif is_named == True:
                if hasattr(node, "name"):
                    return True
                else:
                    return False
            elif is_named == False:
                if not hasattr(node, "name"):
                    return True
                else:
                    return False
            return False

        for node in self.nodes():
            for type in types:
                if node_match(node, type):
                    nodes.append(node)
        return nodes

    def __compute_named_nodes_subgraph(self) -> "ProjectDag":
        """
        Creates a new DAG containing only named nodes, preserving direct relationships
        between named nodes even when connected through unnamed nodes.
        A direct relationship exists when there is a path between two named nodes
        that doesn't pass through any other named nodes.
        """
        named_nodes = []
        # First collect all named nodes
        for node in self.nodes():
            if hasattr(node, "name") and node.name is not None:
                named_nodes.append(node)

        # Create new DAG
        named_dag = ProjectDag()
        named_dag.add_nodes_from(named_nodes)

        # For each named node, find its direct named descendants
        for source in named_nodes:
            stack = [(source, child) for child in self.successors(source)]
            while stack:
                current_parent, current = stack.pop()
                if current in named_nodes and current != source:
                    # Found a named node, add edge from source to this node
                    named_dag.add_edge(source, current)
                elif current not in named_nodes:
                    # If unnamed node, continue searching its children
                    for child in self.successors(current):
                        stack.append((current_parent, child))
        project = named_dag.get_root_nodes()[0]
        named_dag.remove_node(project)
        return named_dag

    def get_named_children(self, node_name: str) -> List[str]:
        """
        Returns a list of names of all named parent nodes for the given node name.
        Uses the named nodes subgraph to determine relationships.
        """
        named_dag = self.get_named_nodes_subgraph()

        try:
            node = named_dag.get_node_by_name(node_name)
            nodes = []
            for predecessor in named_dag.predecessors(node):
                if hasattr(predecessor, "name") and predecessor.name is not None:
                    nodes.append(predecessor.name)
            return nodes
        except ValueError:
            return []

    def get_named_parents(self, node_name: str) -> List[str]:
        """
        Returns a list of names of all named child nodes for the given node name.
        Uses the named nodes subgraph to determine relationships.
        """
        named_dag = self.get_named_nodes_subgraph()

        try:
            node = named_dag.get_node_by_name(node_name)
            nodes = []
            for successor in named_dag.successors(node):
                if hasattr(successor, "name") and successor.name is not None:
                    nodes.append(successor.name)
            return nodes
        except ValueError:
            return []

    def filter_dag(self, filter_str) -> List["ProjectDag"]:
        from networkx import (
            subgraph,
            shortest_path_length,
            descendants,
            ancestors,
            compose,
        )

        if not filter_str:
            return [self]

        filtered_dags = []
        filters = parse_filter_str(filter_str)
        for filter in filters:
            post, name, pre = filter
            item = all_descendants_with_name(name=name, dag=self)
            if len(item) == 1:
                item = item[0]
            else:
                continue
            pre_length = 0
            post_length = 0
            a = ancestors(self, item)
            d = descendants(self, item)
            if pre == "+":
                pre_length = len(a)
            elif pre:
                pre_length = int(pre.replace("+", ""))
            if post == "+":
                post_length = len(d)
            elif post:
                post_length = int(post.replace("+", ""))

            def matches_length_and_side(node):
                return (
                    (node in a and shortest_path_length(self, node, item) <= pre_length)
                    or (node in d and shortest_path_length(self, item, node) <= post_length)
                    or node == item
                )

            filtered_nodes = [node for node in self.nodes if matches_length_and_side(node)]

            filtered_dags.append(subgraph(self, filtered_nodes))

        def combine_dags(dags):
            combined_dags = []
            while dags:
                dag = dags.pop()
                combined = False
                for i, combined_dag in enumerate(combined_dags):
                    if combined_dag.nodes & dag.nodes:
                        combined_dags[i] = compose(dag, combined_dag)
                        combined = True
                        break
                if not combined:
                    combined_dags.append(dag)
            return combined_dags

        combined_dags = filtered_dags.copy()
        while True:
            len_before = len(combined_dags)
            combined_dags = combine_dags(combined_dags)
            if len_before == len(combined_dags):
                break
        return combined_dags

    def get_diff_dag_filter(self, existing_project, existing_dag_filter):
        """
        Compares this project DAG with the existing project's DAG filtered by the existing filter.
        It identifies nodes that have changed or are new and returns a filter string that includes these nodes.

        Parameters:
        - existing_project (Project): The existing project to compare with.
        - existing_dag_filter (str): The filter string used to filter the existing project's DAG.

        Returns:
        - str: A comma-separated filter string that selects all nodes that are dependent on the changed nodes.
        """
        existing_dags = (
            existing_project.dag().get_named_nodes_subgraph().filter_dag(existing_dag_filter)
        )
        existing_nodes = [node for dag in existing_dags for node in dag.nodes()]
        new_dags = self.get_named_nodes_subgraph().filter_dag(existing_dag_filter)
        new_nodes = [node for dag in new_dags for node in dag.nodes()]
        changed_dag_filter = []
        for new_node in new_nodes:
            existing_node = next((n for n in existing_nodes if n.name == new_node.name), None)
            if existing_node:
                if json.dumps(existing_node.model_dump_json(), sort_keys=True) != json.dumps(
                    new_node.model_dump_json(), sort_keys=True
                ):
                    changed_dag_filter.append(f"{new_node.name}+")
            else:
                changed_dag_filter.append(f"{new_node.name}+")

        return ",".join(changed_dag_filter)
