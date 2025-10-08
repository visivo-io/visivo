"""Validator for dimension references."""

from typing import TYPE_CHECKING
from visivo.models.validators.base_validator import BaseProjectValidator
from visivo.models.dimension import Dimension
from visivo.models.models.model import Model
from visivo.models.dag import all_descendants_of_type

if TYPE_CHECKING:
    from visivo.models.project import Project


class DimensionReferencesValidator(BaseProjectValidator):
    """
    Validates that dimensions only reference valid types.

    Rule: Dimensions can only reference other dimensions or models.
    """

    def validate(self, project: "Project") -> "Project":
        """
        Validate that dimensions only reference dimensions or models.

        Args:
            project: The project to validate

        Returns:
            The validated project

        Raises:
            ValueError: If a dimension references an invalid type
        """
        dag = project.dag()
        all_dimensions = all_descendants_of_type(type=Dimension, dag=dag)

        for dimension in all_dimensions:
            self._validate_dimension_references(dimension, dag)

        return project

    def _validate_dimension_references(self, dimension: Dimension, dag):
        """Validate that a dimension only references dimensions or models."""
        # Get all successors (what this dimension depends on)
        for successor in dag.successors(dimension):
            if not isinstance(successor, (Dimension, Model)):
                raise ValueError(
                    f"Dimension '{dimension.name}' has an invalid reference to "
                    f"{successor.__class__.__name__} '{getattr(successor, 'name', 'unnamed')}'. "
                    f"Dimensions can only reference other dimensions or models."
                )
