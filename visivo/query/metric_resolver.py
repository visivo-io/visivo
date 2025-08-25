"""
MetricResolver handles metric composition and dependency resolution using the ProjectDag.

This module provides functionality to:
1. Leverage the ProjectDag for metric dependency resolution
2. Topologically sort metrics for evaluation order
3. Detect circular dependencies
4. Resolve metric expressions by substituting referenced metrics
"""

from typing import Dict, List, Optional, Set
from visivo.models.metric import Metric
from visivo.models.models.sql_model import SqlModel
from visivo.models.project import Project
from visivo.models.base.project_dag import ProjectDag
from visivo.logger.logger import Logger
from visivo.models.base.context_string import METRIC_REF_PATTERN
import re
from collections import defaultdict, deque


class CircularDependencyError(Exception):
    """Raised when circular dependencies are detected in metric references."""

    pass


class MetricNotFoundError(Exception):
    """Raised when a referenced metric cannot be found."""

    pass


class MetricResolver:
    """
    Resolves metric compositions by leveraging the ProjectDag for dependencies.

    This class uses the existing ProjectDag to understand metric relationships,
    detect circular dependencies, and resolve expressions by substituting
    referenced metrics with their actual SQL expressions.
    """

    def __init__(self, project: Project):
        """
        Initialize the MetricResolver with a project.

        Args:
            project: The project with all metrics and models
        """
        self.project = project
        self.dag: ProjectDag = project.dag()
        self._metric_cache: Dict[str, str] = {}
        self._build_metric_index()

    def _build_metric_index(self):
        """Build an index of all metrics in the project."""
        self.metrics_by_name = {}

        # Get all metrics from the DAG
        from visivo.models.dag import all_descendants_of_type

        all_metrics = all_descendants_of_type(type=Metric, dag=self.dag)

        for metric in all_metrics:
            # Add by simple name
            self.metrics_by_name[metric.name] = metric

            # For model-scoped metrics, also add with model qualifier
            # Find the parent model in the DAG
            for predecessor in self.dag.predecessors(metric):
                if isinstance(predecessor, SqlModel):
                    qualified_name = f"{predecessor.name}.{metric.name}"
                    self.metrics_by_name[qualified_name] = metric
                    break

    def find_metric(self, name: str) -> Optional[Metric]:
        """
        Find a metric by name in the project's DAG.

        Args:
            name: Metric name (can be "metric_name" or "model.metric_name")

        Returns:
            The Metric object if found, None otherwise
        """
        return self.metrics_by_name.get(name)

    def get_metric_dependencies(
        self, metric_name: str, visited: Optional[Set[str]] = None
    ) -> Set[str]:
        """
        Get all metrics that a given metric depends on using the DAG.

        Args:
            metric_name: Name of the metric
            visited: Set of already visited metrics to prevent infinite recursion

        Returns:
            Set of all metric names this metric depends on
        """
        if visited is None:
            visited = set()

        # Prevent infinite recursion
        if metric_name in visited:
            return set()

        visited.add(metric_name)

        metric = self.find_metric(metric_name)
        if not metric:
            return set()

        dependencies = set()

        # Parse the metric expression to find referenced metrics
        for match in re.finditer(METRIC_REF_PATTERN, metric.expression):
            ref_content = match.group(1)
            metric_field = match.group(2)

            if metric_field:
                # ${ref(model).metric_name} format
                referenced_name = f"{ref_content}.{metric_field}"
            else:
                # ${ref(metric_name)} format
                referenced_name = ref_content

            # Only add if it's actually a metric
            if self.find_metric(referenced_name):
                dependencies.add(referenced_name)
                # Recursively get dependencies (passing visited set)
                dependencies.update(self.get_metric_dependencies(referenced_name, visited.copy()))

        return dependencies

    def detect_circular_dependencies(self) -> Optional[List[str]]:
        """
        Detect circular dependencies in metrics using DFS.

        Returns:
            List of metric names forming a cycle, or None if no cycles
        """

        def dfs(metric_name: str, visited: Set[str], stack: List[str]) -> Optional[List[str]]:
            if metric_name in stack:
                # Found a cycle - return the cycle path
                cycle_start = stack.index(metric_name)
                return stack[cycle_start:] + [metric_name]

            if metric_name in visited:
                return None

            visited.add(metric_name)
            stack.append(metric_name)

            metric = self.find_metric(metric_name)
            if metric:
                # Get direct dependencies (not recursive)
                for match in re.finditer(METRIC_REF_PATTERN, metric.expression):
                    ref_content = match.group(1)
                    metric_field = match.group(2)

                    if metric_field:
                        referenced_name = f"{ref_content}.{metric_field}"
                    else:
                        referenced_name = ref_content

                    if self.find_metric(referenced_name):
                        cycle = dfs(referenced_name, visited, stack.copy())
                        if cycle:
                            return cycle

            stack.pop()
            return None

        visited = set()
        for metric_name in self.metrics_by_name:
            if metric_name not in visited:
                cycle = dfs(metric_name, visited, [])
                if cycle:
                    return cycle

        return None

    def topological_sort(self) -> List[str]:
        """
        Perform topological sort on metrics for evaluation order.

        This ensures metrics are resolved in dependency order.

        Returns:
            List of metric names in topological order

        Raises:
            CircularDependencyError: If circular dependencies are detected
        """
        # Check for circular dependencies first
        cycle = self.detect_circular_dependencies()
        if cycle:
            cycle_str = " -> ".join(cycle)
            raise CircularDependencyError(f"Circular dependency detected: {cycle_str}")

        # Build adjacency list (metric -> its dependencies)
        adjacency = {}
        in_degree = defaultdict(int)

        # Initialize all metrics
        for metric_name in self.metrics_by_name:
            adjacency[metric_name] = set()
            in_degree[metric_name] = 0

        # Build dependency graph
        # adjacency[A] contains metrics that A depends on
        # in_degree[A] is the number of metrics that depend on A
        for metric_name in self.metrics_by_name:
            metric = self.find_metric(metric_name)
            if metric:
                # Get direct dependencies only
                for match in re.finditer(METRIC_REF_PATTERN, metric.expression):
                    ref_content = match.group(1)
                    metric_field = match.group(2)

                    if metric_field:
                        referenced_name = f"{ref_content}.{metric_field}"
                    else:
                        referenced_name = ref_content

                    if self.find_metric(referenced_name):
                        adjacency[metric_name].add(referenced_name)
                        in_degree[metric_name] += 1  # metric_name depends on referenced_name

        # Find metrics with no dependencies (base metrics)
        queue = deque([m for m in self.metrics_by_name if in_degree[m] == 0])
        sorted_metrics = []

        while queue:
            metric = queue.popleft()
            sorted_metrics.append(metric)

            # Find all metrics that depend on this one
            for other_metric in self.metrics_by_name:
                if metric in adjacency[other_metric]:
                    in_degree[other_metric] -= 1
                    if in_degree[other_metric] == 0:
                        queue.append(other_metric)

        # If we didn't sort all metrics, there must be a cycle (shouldn't happen after check)
        if len(sorted_metrics) != len(self.metrics_by_name):
            raise CircularDependencyError("Circular dependency detected during topological sort")

        return sorted_metrics

    def resolve_metric_expression(
        self, metric_name: str, visited: Optional[Set[str]] = None
    ) -> str:
        """
        Resolve a metric expression by substituting all referenced metrics.

        Args:
            metric_name: Name of the metric to resolve
            visited: Set of already visited metrics (for cycle detection)

        Returns:
            Fully resolved SQL expression with all metric references substituted

        Raises:
            MetricNotFoundError: If a referenced metric cannot be found
            CircularDependencyError: If circular dependencies are detected
        """
        # Check cache first
        if metric_name in self._metric_cache:
            return self._metric_cache[metric_name]

        # Initialize visited set for cycle detection
        if visited is None:
            visited = set()

        if metric_name in visited:
            raise CircularDependencyError(
                f"Circular dependency detected while resolving metric: {metric_name}"
            )

        # Find the metric
        metric = self.find_metric(metric_name)
        if not metric:
            raise MetricNotFoundError(f"Metric not found: {metric_name}")

        visited.add(metric_name)

        # Start with the original expression
        resolved_expression = metric.expression

        # Find and substitute all metric references
        def replace_reference(match):
            ref_content = match.group(1)
            metric_field = match.group(2)

            # Determine the referenced metric name
            if metric_field:
                # ${ref(model).metric_name} format
                referenced_name = f"{ref_content}.{metric_field}"
            else:
                # ${ref(metric_name)} format
                referenced_name = ref_content

            # Check if it's a metric reference
            referenced_metric = self.find_metric(referenced_name)

            # If not found by exact name, try to find unqualified metric
            if not referenced_metric and not metric_field:
                # This is ${ref(metric_name)} without a model qualifier
                # Search for it in all metrics
                candidates = []
                for full_name, m in self.metrics_by_name.items():
                    if "." in full_name and full_name.endswith(f".{referenced_name}"):
                        candidates.append((full_name, m))

                if len(candidates) == 1:
                    # Unique match found
                    referenced_name = candidates[0][0]
                    referenced_metric = candidates[0][1]
                elif len(candidates) > 1:
                    # Ambiguous reference
                    model_names = [c[0].split(".")[0] for c in candidates]
                    raise MetricNotFoundError(
                        f"Metric reference '${{ref({ref_content})}}' is ambiguous. "
                        f"Found in models: {model_names}. "
                        f"Please specify: ${{ref(model).{ref_content}}}"
                    )

            if referenced_metric:
                try:
                    # Recursively resolve the referenced metric
                    resolved = self.resolve_metric_expression(referenced_name, visited.copy())
                    return f"({resolved})"
                except MetricNotFoundError as e:
                    Logger.instance().error(
                        f"Error resolving metric reference {referenced_name}: {e}"
                    )
                    # Fall back to original reference
                    return match.group(0)
                except CircularDependencyError:
                    # Re-raise circular dependency errors
                    raise
            else:
                # Not a metric, keep as is (might be a field reference)
                return match.group(0)

        # Replace all metric references
        resolved_expression = re.sub(METRIC_REF_PATTERN, replace_reference, resolved_expression)

        # Cache the result
        self._metric_cache[metric_name] = resolved_expression

        return resolved_expression

    def resolve_all_metrics(self) -> Dict[str, str]:
        """
        Resolve all metrics in the project in dependency order.

        Returns:
            Dictionary mapping metric names to their resolved expressions
        """
        # Sort metrics to ensure dependencies are resolved first
        sorted_metrics = self.topological_sort()

        resolved = {}
        for metric_name in sorted_metrics:
            if metric_name in self.metrics_by_name:
                try:
                    resolved[metric_name] = self.resolve_metric_expression(metric_name)
                except Exception as e:
                    Logger.instance().error(f"Failed to resolve metric {metric_name}: {e}")
                    # Continue with other metrics

        return resolved

    def resolve_metric_for_validation(self, metric_name: str) -> tuple[str, List[str]]:
        """
        Resolve a metric expression to pure SQL for validation purposes.

        This method resolves all ${ref()} patterns in a metric expression,
        replacing them with actual SQL expressions. It also tracks which
        models are involved in the metric.

        Args:
            metric_name: Name of the metric to resolve

        Returns:
            Tuple of (resolved_sql, involved_models)
            - resolved_sql: Pure SQL expression with all references resolved
            - involved_models: List of model names that this metric depends on

        Raises:
            MetricNotFoundError: If the metric or a referenced metric cannot be found
            CircularDependencyError: If circular dependencies are detected
        """
        # Find the metric
        metric = self.find_metric(metric_name)
        if not metric:
            # Check if this is an unqualified reference to a model metric
            # Try to find it in all model metrics
            for full_name, m in self.metrics_by_name.items():
                if "." in full_name and full_name.endswith(f".{metric_name}"):
                    if metric is not None:
                        # Ambiguous - found in multiple models
                        models = [
                            n.split(".")[0]
                            for n in self.metrics_by_name.keys()
                            if "." in n and n.endswith(f".{metric_name}")
                        ]
                        raise MetricNotFoundError(
                            f"Metric reference '{{ref({metric_name})}}' is ambiguous. "
                            f"Found in multiple models: {models}. "
                            f"Please specify the model: ${{ref(model).{metric_name}}}"
                        )
                    metric = m
                    metric_name = full_name  # Use the full qualified name

            if not metric:
                available = list(self.metrics_by_name.keys())
                raise MetricNotFoundError(
                    f"Metric '{metric_name}' not found. "
                    f"Available metrics: {available[:10]}{'...' if len(available) > 10 else ''}"
                )

        # Resolve the expression
        try:
            resolved_expression = self.resolve_metric_expression(metric_name)
        except CircularDependencyError as e:
            # Re-raise with more context
            raise CircularDependencyError(
                f"Cannot resolve metric '{metric_name}' due to circular dependency: {str(e)}"
            )

        # Get the models involved
        involved_models = list(self.get_models_from_metric(metric_name))

        return resolved_expression, involved_models

    def get_models_from_metric(self, metric_name: str) -> Set[str]:
        """
        Get all models referenced by a metric using the DAG.

        This method uses the DAG to find which models a metric depends on,
        either directly (for model-scoped metrics) or through field references.

        Args:
            metric_name: Name of the metric to analyze

        Returns:
            Set of model names that this metric references
        """
        models = set()

        try:
            metric = self.find_metric(metric_name)
            if not metric:
                return models

            # If metric_name contains a dot, it's already model-scoped
            if "." in metric_name:
                model_name = metric_name.split(".")[0]
                models.add(model_name)
            else:
                # Check if this metric is a child of a model in the DAG
                for predecessor in self.dag.predecessors(metric):
                    if isinstance(predecessor, SqlModel):
                        models.add(predecessor.name)
                        break

            # Get all metrics this metric depends on
            dependencies = self.get_metric_dependencies(metric_name)

            # For each dependency, check if it's model-scoped
            for dep_name in dependencies:
                if "." in dep_name:
                    model_name = dep_name.split(".")[0]
                    models.add(model_name)
                else:
                    # If it's an unqualified metric reference, find which model it belongs to
                    dep_metric = self.find_metric(dep_name)
                    if dep_metric:
                        # Check if this metric is in a model
                        for full_name, m in self.metrics_by_name.items():
                            if m == dep_metric and "." in full_name:
                                model_name = full_name.split(".")[0]
                                models.add(model_name)
                                break

            # Also look for direct model field references in the expression
            # Pattern: ${ref(model).field} where field is NOT a metric
            for match in re.finditer(METRIC_REF_PATTERN, metric.expression):
                ref_content = match.group(1)
                field = match.group(2)

                # If there's a field and ref_content is not a metric, it's a model reference
                if field and ref_content not in self.metrics_by_name:
                    # Check if ref_content is actually a model name
                    from visivo.models.dag import all_descendants_of_type

                    all_models = all_descendants_of_type(type=SqlModel, dag=self.dag)
                    for model in all_models:
                        if model.name == ref_content:
                            models.add(ref_content)
                            break

            return models

        except Exception as e:
            Logger.instance().error(f"Failed to get models from metric {metric_name}: {e}")
            return set()

    def get_metric_lineage(self, metric_name: str) -> Dict[str, Set[str]]:
        """
        Get the direct lineage of a metric using the DAG.

        Returns:
            Dictionary with 'upstream' (direct dependencies) and 'downstream' (direct dependents)
        """
        lineage = {"upstream": set(), "downstream": set()}

        metric = self.find_metric(metric_name)
        if not metric:
            return lineage

        # Get upstream (direct dependencies only)
        if metric:
            for match in re.finditer(METRIC_REF_PATTERN, metric.expression):
                ref_content = match.group(1)
                metric_field = match.group(2)

                if metric_field:
                    referenced_name = f"{ref_content}.{metric_field}"
                else:
                    referenced_name = ref_content

                if self.find_metric(referenced_name):
                    lineage["upstream"].add(referenced_name)

        # Get downstream (metrics that directly depend on this one)
        for other_metric_name, other_metric in self.metrics_by_name.items():
            if other_metric_name != metric_name:
                # Check if other_metric directly references this metric
                for match in re.finditer(METRIC_REF_PATTERN, other_metric.expression):
                    ref_content = match.group(1)
                    metric_field = match.group(2)

                    if metric_field:
                        referenced_name = f"{ref_content}.{metric_field}"
                    else:
                        referenced_name = ref_content

                    if referenced_name == metric_name:
                        lineage["downstream"].add(other_metric_name)
                        break  # No need to check more references in this metric

        return lineage
