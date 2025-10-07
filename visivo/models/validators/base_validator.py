"""Base validator class for project validators."""

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from visivo.models.project import Project


class BaseProjectValidator(ABC):
    """Base class for all project validators."""

    @abstractmethod
    def validate(self, project: "Project") -> "Project":
        """
        Validate the project.

        Args:
            project: The project to validate

        Returns:
            The validated project

        Raises:
            ValueError: If validation fails
        """
        pass
