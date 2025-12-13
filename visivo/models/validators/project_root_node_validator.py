"""Validator for ensuring project is the sole root node."""

from visivo.models.validators.base_validator import BaseProjectValidator
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from visivo.models.project import Project


class ProjectRootNodeValidator(BaseProjectValidator):
    """Validates that the project is the sole root node in the DAG."""

    def validate(self, project: "Project") -> "Project":
        """
        Validate that project is the sole root node in the DAG.

        Args:
            project: The project to validate

        Returns:
            The validated project

        Raises:
            ValueError: If project is not the sole root node
        """
        dag = project.dag()
        roots = dag.get_root_nodes()
        if len(roots) > 1:
            root_list = ", ".join([root.__class__.__name__ for root in roots])
            raise ValueError(
                f"Project must be the sole root node in the DAG. Current root nodes: {root_list}"
            )
        elif len(roots) == 0:
            raise ValueError("No root nodes found in the DAG. Please add a name for your project.")
        elif len(roots) == 1:
            root = roots[0]
            if root.__class__.__name__ != "Project":
                raise ValueError("The sole root node in the DAG must be a Project.")
        return project
