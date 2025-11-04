"""Validator for default source and alert names."""

from visivo.models.validators.base_validator import BaseProjectValidator
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from visivo.models.project import Project


class DefaultNamesValidator(BaseProjectValidator):
    """Validates that default source and alert names exist in the project."""

    def validate(self, project: "Project") -> "Project":
        """
        Validate that default source and alert names reference existing objects.

        Args:
            project: The project to validate

        Returns:
            The validated project

        Raises:
            ValueError: If default names reference non-existent objects
        """
        sources, alerts = (project.sources, project.alerts)
        source_names = [source.name for source in sources]
        alert_names = [alert.name for alert in alerts]
        defaults = project.defaults

        if not defaults:
            return project

        if defaults.source_name and defaults.source_name not in source_names:
            raise ValueError(f"default source '{defaults.source_name}' does not exist")

        if defaults.alert_name and defaults.alert_name not in alert_names:
            raise ValueError(f"default alert '{defaults.alert_name}' does not exist")

        return project
