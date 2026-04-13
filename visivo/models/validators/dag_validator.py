"""Validator for DAG structure and constraints."""

from visivo.models.validators.base_validator import BaseProjectValidator
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from visivo.models.project import Project


class DagValidator(BaseProjectValidator):
    """Validates DAG structure and constraints (no cycles)."""

    def validate(self, project: "Project") -> "Project":
        """
        Validate the project DAG.

        Args:
            project: The project to validate

        Returns:
            The validated project

        Raises:
            ValueError: If DAG validation fails
        """
        dag = project.dag()
        if not dag.validate_dag():
            raise ValueError("Project contains a circular reference.")

        return project
