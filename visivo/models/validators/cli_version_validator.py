"""Validator for CLI version compatibility."""

from click import ClickException
from visivo.models.validators.base_validator import BaseProjectValidator
from visivo.version import VISIVO_VERSION
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from visivo.models.project import Project


class CliVersionValidator(BaseProjectValidator):
    """Validates that the project CLI version matches the installed version."""

    def validate(self, project: "Project") -> "Project":
        """
        Validate that project CLI version matches installed CLI version.

        Args:
            project: The project to validate

        Returns:
            The validated project

        Raises:
            ClickException: If versions don't match
        """
        if project.cli_version != VISIVO_VERSION:
            raise ClickException(
                f"The project specifies {project.cli_version}, but the current version of visivo installed is {VISIVO_VERSION}. Your project version needs to match your CLI version."
            )
        return project
