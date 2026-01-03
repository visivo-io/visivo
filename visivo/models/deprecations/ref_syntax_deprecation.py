"""Deprecation checker for legacy ref() syntax."""

import re
from typing import TYPE_CHECKING, List, Any

from visivo.models.deprecations.base_deprecation import (
    BaseDeprecationChecker,
    DeprecationWarning,
    MigrationAction,
)
from visivo.query.patterns import (
    REF_PROPERTY_PATTERN,
    CONTEXT_STRING_REF_PATTERN,
    get_model_name_from_match,
)
from visivo.utils import list_all_ymls_in_dir

if TYPE_CHECKING:
    from visivo.models.project import Project

# Pattern to find bare ref(name) in YAML files
# This matches ref(name) when not preceded by ${
BARE_REF_PATTERN = re.compile(
    r'(?<!\$\{)(?<!\$\{\s)ref\(\s*(?P<model_name>[a-zA-Z0-9\s\'"\-_]+)\s*\)'
)


class RefSyntaxDeprecation(BaseDeprecationChecker):
    """
    Warns about deprecated ref() syntax usage.

    Deprecated syntaxes:
      - Bare ref(model_name) - should use ${refs.model_name}
      - ${ref(model_name)} or ${ref(model_name).property} - should use ${refs.model_name.property}

    All ref patterns should migrate to the new ${refs.name.property} format
    which is consistent with ${env.VAR} syntax.
    """

    REMOVAL_VERSION = "2.0.0"
    FEATURE_NAME = "Legacy ref() syntax"
    MIGRATION_GUIDE = "Replace ref(name) with ${refs.name} format."

    def check(self, project: "Project") -> List[DeprecationWarning]:
        """
        Check for deprecated raw ref(name) syntax usage.

        Args:
            project: The project to check

        Returns:
            List of deprecation warnings found
        """
        warnings = []
        bare_ref_pattern = re.compile(REF_PROPERTY_PATTERN)

        # Dump entire project to dict and recursively check all string values
        project_data = project.model_dump(exclude_none=True)
        self._check_recursive(project_data, bare_ref_pattern, warnings, "project")

        return warnings

    def _check_recursive(
        self,
        data: Any,
        pattern: re.Pattern,
        warnings: List[DeprecationWarning],
        path: str,
    ) -> None:
        """Recursively check data structure for bare ref patterns."""
        if isinstance(data, dict):
            for key, value in data.items():
                new_path = f"{path}.{key}"
                self._check_recursive(value, pattern, warnings, new_path)
        elif isinstance(data, list):
            for idx, item in enumerate(data):
                new_path = f"{path}[{idx}]"
                self._check_recursive(item, pattern, warnings, new_path)
        elif isinstance(data, str) and pattern.match(data):
            warnings.append(self._create_warning(data, path))

    def _create_warning(self, ref_value: str, location: str = None) -> DeprecationWarning:
        """Create a deprecation warning for a legacy ref."""
        # Extract the model name from ref(model_name)
        match = re.match(REF_PROPERTY_PATTERN, ref_value)
        model_name = match.group("model_name").strip() if match else ref_value

        # Strip quotes from model name if present
        if (model_name.startswith("'") and model_name.endswith("'")) or (
            model_name.startswith('"') and model_name.endswith('"')
        ):
            model_name = model_name[1:-1]

        return DeprecationWarning(
            feature=self.FEATURE_NAME,
            message=f"'{ref_value}' uses deprecated syntax.",
            migration=f"Replace with '${{refs.{model_name}}}' format.",
            removal_version=self.REMOVAL_VERSION,
            location=location or "",
        )

    def can_migrate(self) -> bool:
        """This checker supports automatic migration."""
        return True

    def get_migrations_from_files(self, working_dir: str) -> List[MigrationAction]:
        """
        Scan YAML files for legacy ref() patterns and return migrations.

        Converts:
          - ref(name) -> ${refs.name}
          - ${ref(name)} -> ${refs.name}
          - ${ref(name).property} -> ${refs.name.property}
        """
        migrations = []
        context_ref_pattern = re.compile(CONTEXT_STRING_REF_PATTERN)

        for file_path in list_all_ymls_in_dir(working_dir):
            try:
                with open(file_path, "r") as f:
                    content = f.read()

                # Find all ${ref(name).property} patterns (context string syntax)
                for match in context_ref_pattern.finditer(content):
                    old_text = match.group(0)
                    model_name = get_model_name_from_match(match)
                    property_path = match.group("property_path") or ""

                    # Convert to new refs syntax
                    new_text = self._convert_to_refs_syntax(model_name, property_path)

                    migrations.append(
                        MigrationAction(
                            file_path=str(file_path),
                            old_text=old_text,
                            new_text=new_text,
                            description="context string ref to refs syntax",
                        )
                    )

                # Find bare ref(name) patterns (not inside ${})
                # We need to be careful not to match ref() inside ${ref()}
                for match in BARE_REF_PATTERN.finditer(content):
                    old_text = match.group(0)
                    model_name = match.group("model_name").strip()

                    # Strip quotes from model name if present
                    if (model_name.startswith("'") and model_name.endswith("'")) or (
                        model_name.startswith('"') and model_name.endswith('"')
                    ):
                        model_name = model_name[1:-1]

                    new_text = f"${{refs.{model_name}}}"

                    migrations.append(
                        MigrationAction(
                            file_path=str(file_path),
                            old_text=old_text,
                            new_text=new_text,
                            description="bare ref to refs syntax",
                        )
                    )

            except Exception:
                # Skip files that can't be read
                continue

        return migrations

    def _convert_to_refs_syntax(self, model_name: str, property_path: str) -> str:
        """
        Convert model name and property path to new ${refs.name.property} syntax.

        Args:
            model_name: The model/ref name (already stripped of quotes)
            property_path: The property path (e.g., ".id" or "[0].value")

        Returns:
            New refs syntax string like ${refs.model.property}
        """
        if property_path:
            # property_path might start with . or [
            # For .property, we need refs.model.property
            # For [0], we need refs.model[0]
            if property_path.startswith("."):
                return f"${{refs.{model_name}{property_path}}}"
            else:
                return f"${{refs.{model_name}{property_path}}}"
        else:
            return f"${{refs.{model_name}}}"
