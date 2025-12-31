"""Deprecation checker for legacy {{ env_var('VAR') }} Jinja syntax."""

from typing import TYPE_CHECKING, List

from visivo.models.deprecations.base_deprecation import (
    BaseDeprecationChecker,
    DeprecationWarning,
)
from visivo.templates.render_yaml import get_env_var_deprecation_warnings

if TYPE_CHECKING:
    from visivo.models.project import Project


class EnvVarSyntaxDeprecation(BaseDeprecationChecker):
    """Check for deprecated {{ env_var('VAR') }} Jinja syntax."""

    def check(self, project: "Project") -> List[DeprecationWarning]:
        """
        Return deprecation warnings for legacy env_var() syntax.

        These warnings are collected during YAML parsing by render_yaml.py
        and retrieved here after parsing completes.
        """
        warnings = []
        collected = get_env_var_deprecation_warnings()

        for item in collected:
            var_name = item["var_name"]
            file_path = item.get("file_path", "")

            warnings.append(
                DeprecationWarning(
                    feature="{{ env_var('...') }} Jinja syntax",
                    message=f"Found {{{{ env_var('{var_name}') }}}} - this syntax will be removed.",
                    migration=f"Use ${{env.{var_name}}} instead.",
                    removal_version="1.0.0",
                    location=file_path or "",
                )
            )

        return warnings
