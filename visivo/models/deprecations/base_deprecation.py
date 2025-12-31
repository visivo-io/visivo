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


@dataclass
class MigrationAction:
    """Represents a single migration action to apply to a file."""

    file_path: str  # Path to the file to modify
    old_text: str  # The text to replace
    new_text: str  # The replacement text
    description: str = ""  # Optional description of the change


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

    def can_migrate(self) -> bool:
        """
        Return True if this checker supports automatic migration.

        Override in subclasses that implement migration.
        """
        return False

    def get_migrations_from_files(self, working_dir: str) -> List[MigrationAction]:
        """
        Scan files directly for deprecated patterns and return migration actions.

        This method scans YAML files in the working directory for deprecated
        patterns, independent of project parsing. This allows migration to
        work even on projects with syntax errors.

        Args:
            working_dir: The directory to scan for YAML files

        Returns:
            List of migration actions to apply
        """
        return []
