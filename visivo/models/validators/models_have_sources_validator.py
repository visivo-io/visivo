"""Validator for ensuring models have sources."""

from visivo.models.validators.base_validator import BaseProjectValidator
from visivo.models.models.model import Model
from visivo.models.models.sql_model import SqlModel
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from visivo.models.project import Project


class ModelsHaveSourcesValidator(BaseProjectValidator):
    """Validates that all SQL models have a source (either explicit or default)."""

    def validate(self, project: "Project") -> "Project":
        """
        Validate that all SQL models have a source.

        Args:
            project: The project to validate

        Returns:
            The validated project

        Raises:
            ValueError: If a SQL model lacks a source
        """
        defaults = project.defaults
        if defaults and defaults.source_name:
            return project

        for model in project.descendants_of_type(Model):
            if isinstance(model, SqlModel) and not model.source:
                raise ValueError(
                    f"'{model.name}' does not specify a source and project does not specify default source"
                )

        return project
