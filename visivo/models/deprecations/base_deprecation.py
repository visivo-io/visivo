"""Base deprecation checker class for project deprecation warnings."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import TYPE_CHECKING, List

if TYPE_CHECKING:
    from visivo.models.project import Project


@dataclass
class DeprecationWarning:
    """Represents a single deprecation warning."""

    feature: str  # What is deprecated
    message: str  # User-friendly description
    migration: str  # How to migrate
    removal_version: str  # When it will be removed (e.g., "0.5.0")
    location: str = ""  # Optional: file/line where found


class BaseDeprecationChecker(ABC):
    """Base class for all deprecation checkers."""

    @abstractmethod
    def check(self, project: "Project") -> List[DeprecationWarning]:
        """
        Check for deprecated features in the project.

        Args:
            project: The project to check

        Returns:
            List of deprecation warnings found
        """
        pass
