from networkx import DiGraph, simple_cycles, is_directed_acyclic_graph
from visivo.models.dag import all_descendants_of_type
from typing import List, Optional


class ProjectDag(DiGraph):
    """
    Custom implementation of a DiGraph that adds additional methods for validation & data extraction. 
    """
    def validate_dag(self):
        if is_directed_acyclic_graph(self):
            return True
    
        circular_references = list(simple_cycles(self))
        if len(circular_references) > 0:
            circle = " -> ".join(
                list(map(lambda cr: cr.id(), circular_references[0]))
            )
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
            elif is_named==True:
                if hasattr(node, "name"):
                    return True
                else:
                    return False
            elif is_named==False:
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

