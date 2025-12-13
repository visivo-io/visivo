"""Validator for unique names across the project."""

from visivo.models.validators.base_validator import BaseProjectValidator
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from visivo.models.project import Project


class NamesValidator(BaseProjectValidator):
    """Validates that names are unique within their scope."""

    def validate(self, project: "Project") -> "Project":
        """
        Validate that names are unique.

        Args:
            project: The project to validate

        Returns:
            The validated project

        Raises:
            ValueError: If duplicate names are found
        """
        # Import here to avoid circular dependency
        from visivo.models.project import Project

        Project.traverse_names([], project)
        return project
