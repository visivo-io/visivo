import json
import re
from networkx import DiGraph, simple_cycles, is_directed_acyclic_graph
from visivo.models.dag import all_descendants_with_name, parse_filter_str
from typing import List, Optional, Dict, Any, Set, Tuple


class ProjectDag(DiGraph):
    """
    Custom implementation of a DiGraph that adds additional methods for validation & data extraction.
    Supports both object-level and field-level lineage tracking.
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
        # Exclude field nodes from root nodes
        roots = [
            node for node, deg in self.in_degree() if deg == 0 and not isinstance(node, FieldNode)
        ]
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

    # Field-level lineage tracking methods
    def add_field_node(self, field_id: str, metadata: Dict[str, Any] = None) -> None:
        """
        Add a field/column node to the DAG.

        Args:
            field_id: Unique identifier for the field (e.g., "model_name.column_name")
            metadata: Optional metadata about the field (type, description, etc.)
        """
        # Create a field node object that can be distinguished from regular nodes
        field_node = FieldNode(field_id, metadata or {})
        self.add_node(field_node)

    def add_field_edge(self, source_field: str, target_field: str) -> None:
        """
        Add a dependency edge between two fields.

        Args:
            source_field: ID of the source field
            target_field: ID of the target field that depends on source_field
        """
        # Find the field nodes
        source_node = self._get_field_node(source_field)
        target_node = self._get_field_node(target_field)

        if source_node and target_node:
            self.add_edge(source_node, target_node)

    def get_field_lineage(self, field_id: str) -> Dict[str, List[str]]:
        """
        Get upstream and downstream field dependencies for a given field.

        Args:
            field_id: ID of the field to get lineage for

        Returns:
            Dictionary with 'upstream' and 'downstream' lists of field IDs
        """
        field_node = self._get_field_node(field_id)
        if not field_node:
            return {"upstream": [], "downstream": []}

        # Get upstream fields (predecessors)
        upstream = []
        for predecessor in self.predecessors(field_node):
            if isinstance(predecessor, FieldNode):
                upstream.append(predecessor.field_id)

        # Get downstream fields (successors)
        downstream = []
        for successor in self.successors(field_node):
            if isinstance(successor, FieldNode):
                downstream.append(successor.field_id)

        return {"upstream": upstream, "downstream": downstream}

    def get_all_field_nodes(self) -> List["FieldNode"]:
        """
        Get all field nodes in the DAG.

        Returns:
            List of FieldNode objects
        """
        return [node for node in self.nodes() if isinstance(node, FieldNode)]

    def get_field_metadata(self, field_id: str) -> Dict[str, Any]:
        """
        Get metadata for a specific field.

        Args:
            field_id: ID of the field

        Returns:
            Metadata dictionary for the field, or empty dict if not found
        """
        field_node = self._get_field_node(field_id)
        return field_node.metadata if field_node else {}

    def get_fields_for_object(self, object_name: str) -> List[str]:
        """
        Get all field IDs associated with a specific object (model, source, etc.).

        Args:
            object_name: Name of the object

        Returns:
            List of field IDs belonging to that object
        """
        fields = []
        for node in self.nodes():
            if isinstance(node, FieldNode) and node.field_id.startswith(f"{object_name}."):
                fields.append(node.field_id)
        return fields

    def _get_field_node(self, field_id: str) -> Optional["FieldNode"]:
        """
        Find a field node by its ID.

        Args:
            field_id: ID of the field to find

        Returns:
            FieldNode object if found, None otherwise
        """
        for node in self.nodes():
            if isinstance(node, FieldNode) and node.field_id == field_id:
                return node
        return None

    def add_field_to_object_edge(self, field_id: str, object_node: Any) -> None:
        """
        Add an edge from a field to its parent object node.

        Args:
            field_id: ID of the field
            object_node: The object node that contains this field
        """
        field_node = self._get_field_node(field_id)
        if field_node and object_node in self.nodes():
            self.add_edge(object_node, field_node)

    def get_field_impact_analysis(self, field_id: str, max_depth: int = None) -> Set[str]:
        """
        Get all fields that would be impacted by changes to the specified field.

        Args:
            field_id: ID of the field to analyze
            max_depth: Maximum depth to traverse (None for unlimited)

        Returns:
            Set of field IDs that depend on the specified field
        """
        field_node = self._get_field_node(field_id)
        if not field_node:
            return set()

        impacted = set()
        visited = set()
        queue = [(field_node, 0)]

        while queue:
            current, depth = queue.pop(0)

            if current in visited:
                continue

            visited.add(current)

            for successor in self.successors(current):
                if isinstance(successor, FieldNode):
                    # Only add to impacted if within depth limit
                    if max_depth is None or depth < max_depth:
                        impacted.add(successor.field_id)
                        queue.append((successor, depth + 1))

        return impacted


class FieldNode:
    """
    Represents a field/column node in the DAG.
    """

    def __init__(self, field_id: str, metadata: Dict[str, Any] = None):
        """
        Initialize a field node.

        Args:
            field_id: Unique identifier for the field (e.g., "model_name.column_name")
            metadata: Optional metadata about the field
        """
        self.field_id = field_id
        self.metadata = metadata or {}
        self.node_type = "field"  # Mark this as a field node

    def id(self):
        """Return the identifier for this field node (used in DAG operations)."""
        return self.field_id

    def __str__(self):
        return f"FieldNode({self.field_id})"

    def __repr__(self):
        return f"FieldNode(field_id='{self.field_id}', metadata={self.metadata})"

    def __eq__(self, other):
        if isinstance(other, FieldNode):
            return self.field_id == other.field_id
        return False

    def __hash__(self):
        return hash(self.field_id)
