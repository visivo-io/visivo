"""Deprecation checker for legacy {{ env_var('VAR') }} Jinja syntax."""

import re
from typing import TYPE_CHECKING, List

from visivo.models.deprecations.base_deprecation import (
    BaseDeprecationChecker,
    DeprecationWarning,
    MigrationAction,
)
from visivo.templates.render_yaml import (
    get_env_var_deprecation_warnings,
    DEPRECATED_ENV_VAR_PATTERN,
)
from visivo.utils import list_all_ymls_in_dir

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
                    removal_version="2.0.0",
                    location=file_path or "",
                )
            )

        return warnings

    def can_migrate(self) -> bool:
        """This checker supports automatic migration."""
        return True

    def get_migrations_from_files(self, working_dir: str) -> List[MigrationAction]:
        """
        Scan YAML files for {{ env_var('VAR') }} patterns and return migrations.

        Converts {{ env_var('VAR_NAME') }} to ${env.VAR_NAME}
        """
        migrations = []

        for file_path in list_all_ymls_in_dir(working_dir):
            try:
                with open(file_path, "r") as f:
                    content = f.read()

                # Find all matches
                for match in DEPRECATED_ENV_VAR_PATTERN.finditer(content):
                    var_name = match.group(1)
                    old_text = match.group(0)
                    new_text = f"${{env.{var_name}}}"

                    migrations.append(
                        MigrationAction(
                            file_path=str(file_path),
                            old_text=old_text,
                            new_text=new_text,
                            description="env_var Jinja to context string",
                        )
                    )
            except Exception:
                # Skip files that can't be read
                continue

        return migrations
