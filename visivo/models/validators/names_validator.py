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

        names, model_scoped = Project.traverse_names([], project)

        # Cross-scope check: a model-scoped metric/dimension alias must not
        # shadow a GLOBAL name (a model, a project-level metric/dimension, an
        # insight, …). Model-local aliases may repeat across models, but if one
        # equals a global name then a bare ``${ref(name)}`` (or an internal
        # ``get_descendant_by_name(name)`` for a model) becomes ambiguous.
        global_names = set(names)
        for model_name, aliases in model_scoped.items():
            for alias in aliases:
                if alias in global_names:
                    raise ValueError(
                        f"Metric/dimension name '{alias}' in model '{model_name}' "
                        f"collides with a project-level name; a model-scoped alias "
                        f"must not shadow a global name (rename one)."
                    )
        return project
