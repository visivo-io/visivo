"""Deprecation checker for raw ref(name) syntax."""

import re
from typing import TYPE_CHECKING, List, Any

from pydantic import BaseModel as PydanticBaseModel

from visivo.models.deprecations.base_deprecation import (
    BaseDeprecationChecker,
    DeprecationWarning,
    MigrationAction,
)
from visivo.query.patterns import REF_PROPERTY_PATTERN, REF_FUNCTION_PATTERN
from visivo.utils import list_all_ymls_in_dir

if TYPE_CHECKING:
    from visivo.models.project import Project


class RefSyntaxDeprecation(BaseDeprecationChecker):
    """
    Warns about raw ref(name) syntax usage.

    The old syntax `ref(model_name)` is deprecated in favor of
    the context string syntax `${ref(model_name)}` which provides
    more flexibility for field references.
    """

    REMOVAL_VERSION = "2.0.0"
    FEATURE_NAME = "Raw ref() syntax"
    MIGRATION_GUIDE = "Replace ref(name) with ${ref(name)} format."

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

        self._check_recursive(project, bare_ref_pattern, warnings, "project")

        return warnings

    def _check_recursive(
        self,
        data: Any,
        pattern: re.Pattern,
        warnings: List[DeprecationWarning],
        path: str,
    ) -> None:
        """Recursively check data structure for bare ref patterns."""
        if isinstance(data, PydanticBaseModel):
            for key, value in data.__dict__.items():
                if value is None:
                    continue
                new_path = f"{path}.{key}"
                self._check_recursive(value, pattern, warnings, new_path)
        elif isinstance(data, dict):
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
        """Create a deprecation warning for a bare ref."""
        # Extract the model name from ref(model_name)
        match = re.match(REF_PROPERTY_PATTERN, ref_value)
        model_name = match.group("model_name").strip() if match else ref_value

        return DeprecationWarning(
            feature=self.FEATURE_NAME,
            message=f"'{ref_value}' uses deprecated syntax.",
            migration=f"Replace with '${{ref({model_name})}}' format.",
            removal_version=self.REMOVAL_VERSION,
            location=location or "",
        )

    def can_migrate(self) -> bool:
        """This checker supports automatic migration."""
        return True

    def get_migrations_from_files(self, working_dir: str) -> List[MigrationAction]:
        """
        Scan YAML files for bare ref(name) patterns and return migrations.

        Finds ref(...) patterns that are NOT inside ${...} context strings
        and wraps them with ${ }.
        """
        migrations = []

        # Pattern to find ref(...) - using REF_FUNCTION_PATTERN without anchors
        ref_pattern = re.compile(REF_FUNCTION_PATTERN)

        # Pattern to detect if we're inside a context string ${...}
        # This matches the opening ${ before a ref
        context_start_pattern = r'\$\{\s*$'

        for file_path in list_all_ymls_in_dir(working_dir):
            try:
                with open(file_path, "r") as f:
                    content = f.read()

                # Find all ref(...) matches
                for match in ref_pattern.finditer(content):
                    ref_text = match.group(0)
                    start_pos = match.start()

                    # Check if this ref is already inside a context string
                    # Look at the text immediately before the match (up to 20 chars back)
                    prefix_start = max(0, start_pos - 20)
                    prefix = content[prefix_start:start_pos]

                    # If the prefix ends with "${" (with optional whitespace), skip this ref
                    # as it's already in a context string
                    if re.search(context_start_pattern, prefix):
                        continue

                    # This is a bare ref that needs migration
                    old_text = ref_text
                    new_text = f"${{{ref_text}}}"

                    migrations.append(
                        MigrationAction(
                            file_path=str(file_path),
                            old_text=old_text,
                            new_text=new_text,
                            description="bare ref to context string",
                        )
                    )

            except Exception:
                # Skip files that can't be read
                continue

        return migrations
