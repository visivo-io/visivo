"""Validator for CLI version compatibility."""

from click import ClickException
from visivo.models.validators.base_validator import BaseProjectValidator
from visivo.version import VISIVO_VERSION
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from visivo.models.project import Project


def _major(version) -> Optional[int]:
    """The major version component of a version string, or None if unparseable."""
    try:
        return int(str(version).split(".")[0])
    except (AttributeError, ValueError, IndexError):
        return None


class CliVersionValidator(BaseProjectValidator):
    """Validates that the project is compatible with the installed CLI version.

    Compatibility is by MAJOR version. A breaking change bumps the major, so a
    project authored on a different major can't run on this one and must be
    upgraded — but within a major, minor/patch differences run fine (a 2.0.x
    project runs on 2.1.x). That's deliberately looser than an exact match: a
    run should use whatever visivo is installed, not be pinned to the exact
    version that authored the project (e.g. the cloud runner runs projects
    deployed by older 2.x CLIs).
    """

    def validate(self, project: "Project") -> "Project":
        """
        Validate that the project's major version matches the installed CLI's.

        Args:
            project: The project to validate

        Returns:
            The validated project

        Raises:
            ClickException: If the major versions are incompatible
        """
        project_major = _major(project.cli_version)
        current_major = _major(VISIVO_VERSION)

        # Only a major-version boundary is incompatible. Unparseable versions are
        # left alone rather than blocked — better to attempt the run than to fail
        # on a version string we didn't understand.
        if (
            project_major is not None
            and current_major is not None
            and project_major != current_major
        ):
            raise ClickException(
                f"This project was built with visivo {project.cli_version}, which is "
                f"not compatible with the installed visivo {VISIVO_VERSION} (major "
                f"version {project_major} vs {current_major}). Upgrade the project to "
                f"v{current_major}.x to run it."
            )
        return project
