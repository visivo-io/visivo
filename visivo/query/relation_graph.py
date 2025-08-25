"""
RelationGraph handles automatic join path resolution for cross-model queries.

This module provides functionality to:
1. Build a graph of model relationships from declared relations
2. Find optimal join paths between models using BFS
3. Detect ambiguous joins and provide clear error messages
4. Generate SQL JOIN clauses for multi-model queries
"""

from typing import Dict, List, Optional, Set, Tuple
from collections import deque, defaultdict
from visivo.models.relation import Relation
from visivo.models.models.model import Model
from visivo.models.project import Project
from visivo.models.base.project_dag import ProjectDag
from visivo.logger.logger import Logger
import networkx as nx


class AmbiguousJoinError(Exception):
    """Raised when multiple join paths exist between models."""

    pass


class NoJoinPathError(Exception):
    """Raised when no join path exists between models."""

    pass


class RelationGraph:
    """
    Manages model relationships and finds optimal join paths.

    This class builds a graph where:
    - Nodes are models
    - Edges are relations between models
    - Weights can represent relation preferences
    """

    def __init__(self, project: Project):
        """
        Initialize the RelationGraph with a project.

        Args:
            project: The project containing models and relations
        """
        self.project = project
        self.dag: ProjectDag = project.dag()
        self.graph = nx.Graph()
        self._build_relation_graph()

    def _build_relation_graph(self):
        """Build the relationship graph from project relations."""
        # Get all models from the DAG
        from visivo.models.dag import all_descendants_of_type

        models = all_descendants_of_type(type=Model, dag=self.dag)
        relations = all_descendants_of_type(type=Relation, dag=self.dag)

        # Add models as nodes
        for model in models:
            self.graph.add_node(model.name, model=model)

        # Add relations as edges
        for relation in relations:
            # Relations already have left_model and right_model fields
            left_model = relation.left_model
            right_model = relation.right_model

            if left_model and right_model:
                # Add edge with relation details
                self.graph.add_edge(
                    left_model,
                    right_model,
                    relation=relation,
                    condition=relation.condition,
                    join_type=relation.join_type,
                    is_default=relation.is_default,
                )

    def _parse_relation_side(self, expression: str) -> Tuple[Optional[str], Optional[str]]:
        """
        Parse a relation side to extract model and field names.

        Args:
            expression: Expression like "model.field" or "${ref(model).field}"

        Returns:
            Tuple of (model_name, field_name)
        """
        import re
        from visivo.models.base.context_string import METRIC_REF_PATTERN

        # Check for ${ref(model).field} pattern
        ref_match = re.match(METRIC_REF_PATTERN, expression.strip())
        if ref_match:
            return ref_match.group(1), ref_match.group(2)

        # Check for direct model.field pattern
        direct_pattern = r"^([a-zA-Z_]\w*)\.([a-zA-Z_]\w*)$"
        direct_match = re.match(direct_pattern, expression.strip())
        if direct_match:
            return direct_match.group(1), direct_match.group(2)

        return None, None

    def find_join_path(self, models: List[str]) -> List[Tuple[str, str, str]]:
        """
        Find the optimal join path connecting all specified models.

        Args:
            models: List of model names to connect

        Returns:
            List of tuples (from_model, to_model, join_condition)

        Raises:
            NoJoinPathError: If models cannot be connected
            AmbiguousJoinError: If multiple equally valid paths exist
        """
        if len(models) < 2:
            return []

        # For two models, use simple shortest path
        if len(models) == 2:
            return self._find_path_between_two(models[0], models[1])

        # For more than two models, find minimum spanning tree
        return self._find_minimum_spanning_tree(models)

    def _find_path_between_two(self, model1: str, model2: str) -> List[Tuple[str, str, str]]:
        """
        Find the shortest path between two models.

        Args:
            model1: First model name
            model2: Second model name

        Returns:
            List of join conditions along the path
        """
        if not self.graph.has_node(model1):
            raise NoJoinPathError(f"Model '{model1}' not found in relation graph")
        if not self.graph.has_node(model2):
            raise NoJoinPathError(f"Model '{model2}' not found in relation graph")

        try:
            # Find shortest path
            path = nx.shortest_path(self.graph, model1, model2)

            # Check for alternative paths of same length
            all_paths = list(nx.all_shortest_paths(self.graph, model1, model2))
            if len(all_paths) > 1:
                # Multiple paths exist - this is ambiguous
                path_descriptions = []
                for p in all_paths[:3]:  # Show first 3 paths
                    path_str = " -> ".join(p)
                    path_descriptions.append(path_str)

                raise AmbiguousJoinError(
                    f"Multiple join paths found between '{model1}' and '{model2}':\n"
                    + "\n".join(f"  - {p}" for p in path_descriptions)
                    + "\n\nPlease specify a preferred path using relation preferences."
                )

            # Build join conditions from the path
            joins = []
            for i in range(len(path) - 1):
                from_model = path[i]
                to_model = path[i + 1]
                edge_data = self.graph.get_edge_data(from_model, to_model)

                if edge_data:
                    condition = edge_data["condition"]
                    joins.append((from_model, to_model, condition))

            return joins

        except nx.NetworkXNoPath:
            raise NoJoinPathError(
                f"No join path found between models '{model1}' and '{model2}'. "
                f"Please define a relation between these models."
            )

    def _find_minimum_spanning_tree(self, models: List[str]) -> List[Tuple[str, str, str]]:
        """
        Find the minimum spanning tree connecting all specified models.

        Args:
            models: List of model names to connect

        Returns:
            List of join conditions forming the spanning tree
        """
        # Create subgraph containing only the specified models
        model_set = set(models)

        # Check all models exist
        for model in models:
            if not self.graph.has_node(model):
                raise NoJoinPathError(f"Model '{model}' not found in relation graph")

        # Find all paths between each pair of models
        all_edges = []
        for i, model1 in enumerate(models):
            for model2 in models[i + 1 :]:
                try:
                    path_joins = self._find_path_between_two(model1, model2)
                    # Add each edge in the path
                    for join in path_joins:
                        if join not in all_edges:
                            all_edges.append(join)
                except (NoJoinPathError, AmbiguousJoinError):
                    # Skip if no path or ambiguous
                    continue

        # Build a graph from collected edges
        tree_graph = nx.Graph()
        for from_model, to_model, condition in all_edges:
            tree_graph.add_edge(from_model, to_model, condition=condition)

        # Check if all models are connected
        if tree_graph.number_of_nodes() < len(models):
            missing = model_set - set(tree_graph.nodes())
            raise NoJoinPathError(
                f"Cannot connect all models. Missing connections for: {', '.join(missing)}"
            )

        # Find minimum spanning tree
        if nx.is_connected(tree_graph):
            mst = nx.minimum_spanning_tree(tree_graph)

            # Convert MST edges back to join conditions
            joins = []
            for from_model, to_model in mst.edges():
                # Get the condition from our all_edges list
                for f, t, c in all_edges:
                    if (f == from_model and t == to_model) or (f == to_model and t == from_model):
                        joins.append((from_model, to_model, c))
                        break

            return joins
        else:
            raise NoJoinPathError("Models form disconnected components and cannot be joined")

    def get_join_condition(self, model1: str, model2: str) -> Optional[str]:
        """
        Get the direct join condition between two models if it exists.

        Args:
            model1: First model name
            model2: Second model name

        Returns:
            Join condition string or None if no direct relation
        """
        if self.graph.has_edge(model1, model2):
            edge_data = self.graph.get_edge_data(model1, model2)
            return edge_data.get("condition")
        return None

    def get_connected_models(self, model: str) -> Set[str]:
        """
        Get all models that can be reached from the given model.

        Args:
            model: Model name

        Returns:
            Set of reachable model names
        """
        if not self.graph.has_node(model):
            return set()

        # Use BFS to find all reachable models
        visited = set()
        queue = deque([model])

        while queue:
            current = queue.popleft()
            if current in visited:
                continue
            visited.add(current)

            # Add neighbors to queue
            for neighbor in self.graph.neighbors(current):
                if neighbor not in visited:
                    queue.append(neighbor)

        visited.remove(model)  # Don't include the starting model
        return visited

    def validate_relations(self) -> List[str]:
        """
        Validate all relations in the project.

        Returns:
            List of validation warnings/errors
        """
        warnings = []

        # Check for disconnected models
        if not nx.is_connected(self.graph):
            components = list(nx.connected_components(self.graph))
            if len(components) > 1:
                warnings.append(
                    f"Warning: {len(components)} disconnected model groups found. "
                    f"Models in different groups cannot be joined."
                )

        # Check for models with no relations
        isolated = list(nx.isolates(self.graph))
        if isolated:
            warnings.append(f"Warning: Models with no relations: {', '.join(isolated)}")

        return warnings

    def suggest_relation(self, model1: str, model2: str) -> Optional[str]:
        """
        Suggest a potential relation between two models based on field names.

        Args:
            model1: First model name
            model2: Second model name

        Returns:
            Suggested relation string or None
        """
        # This would need access to model schemas to suggest relations
        # For now, return a template
        return f"# Suggested relation:\n# {model1}.{model2}_id = {model2}.id"
