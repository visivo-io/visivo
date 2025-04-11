from networkx import DiGraph, simple_cycles, is_directed_acyclic_graph, shortest_path
from visivo.models.dag import all_descendants_of_type
from typing import List, Optional, Set


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

    def get_named_nodes_subgraph(self) -> 'ProjectDag':
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

        return named_dag

    def get_named_parents(self, node_name: str) -> List[str]:
        """
        Returns a list of names of all named parent nodes for the given node name.
        Uses the named nodes subgraph to determine relationships.
        """
        named_dag = self.get_named_nodes_subgraph()
        project = named_dag.get_root_nodes()[0]
        named_dag.remove_node(project)
        try:
            node = named_dag.get_node_by_name(node_name)
            return [pred.name for pred in named_dag.predecessors(node)]
        except ValueError:
            return []

    def get_named_children(self, node_name: str) -> List[str]:
        """
        Returns a list of names of all named child nodes for the given node name.
        Uses the named nodes subgraph to determine relationships.
        """
        named_dag = self.get_named_nodes_subgraph()
        project = named_dag.get_root_nodes()[0]
        named_dag.remove_node(project)
        try:
            node = named_dag.get_node_by_name(node_name)
            nodes = []
            for successor in named_dag.successors(node):
                if hasattr(successor, "name") and successor.name is not None:
                    nodes.append(successor.name)
            return nodes
        except ValueError:
            return []

