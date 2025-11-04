"""Validator for ensuring metrics and dimensions tie back to a single source."""

from typing import Set, TYPE_CHECKING
from visivo.models.validators.base_validator import BaseProjectValidator
from visivo.models.metric import Metric
from visivo.models.dimension import Dimension
from visivo.models.models.model import Model
from visivo.models.sources.source import Source
from visivo.models.dag import all_descendants_of_type

if TYPE_CHECKING:
    from visivo.models.project import Project


class SingleSourceValidator(BaseProjectValidator):
    """
    Validates that metrics and dimensions tie back to a single source.

    Rule: All metrics and dimensions must ultimately reference a single source.
    When you trace all dependencies back through models, they should all resolve
    to the same source.
    """

    def validate(self, project: "Project") -> "Project":
        """
        Validate that metrics and dimensions tie back to a single source.

        Args:
            project: The project to validate

        Returns:
            The validated project

        Raises:
            ValueError: If validation fails
        """
        dag = project.dag()

        # Get all metrics and dimensions
        all_metrics = all_descendants_of_type(type=Metric, dag=dag)
        all_dimensions = all_descendants_of_type(type=Dimension, dag=dag)

        # Validate each metric
        for metric in all_metrics:
            self._validate_single_source(metric, dag, "Metric")

        # Validate each dimension
        for dimension in all_dimensions:
            self._validate_single_source(dimension, dag, "Dimension")

        return project

    def _validate_single_source(self, obj, dag, obj_type: str):
        """
        Validate that a metric or dimension ties back to a single source.

        Args:
            obj: The metric or dimension to validate
            dag: The project DAG
            obj_type: "Metric" or "Dimension" for error messages
        """
        sources = self._get_sources(obj, dag, set())

        if len(sources) == 0:
            raise ValueError(
                f"{obj_type} '{obj.name}' does not tie back to any source. "
                f"All {obj_type.lower()}s must ultimately reference a source through models."
            )

        if len(sources) > 1:
            source_names = sorted([source.name for source in sources])
            raise ValueError(
                f"{obj_type} '{obj.name}' ties back to multiple sources: {', '.join(source_names)}. "
                f"All {obj_type.lower()}s must tie back to a single source."
            )

    def _get_sources(self, obj, dag, visited: Set) -> Set[Source]:
        """
        Recursively find all sources that a metric or dimension depends on.

        Args:
            obj: The object (metric, dimension, or model) to analyze
            dag: The project DAG
            visited: Set of already visited objects to prevent infinite loops

        Returns:
            Set of sources this object ultimately depends on
        """
        if obj in visited:
            return set()

        visited.add(obj)
        sources = set()

        # Get all successors (dependencies)
        for successor in dag.successors(obj):
            if isinstance(successor, Source):
                # Found a source
                sources.add(successor)
            elif isinstance(successor, (Model, Metric, Dimension)):
                # Recurse into referenced object
                sources.update(self._get_sources(successor, dag, visited))

        return sources
