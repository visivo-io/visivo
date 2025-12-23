"""Deprecation checker for raw ref(name) syntax."""

import re
from typing import TYPE_CHECKING, List, Any

from visivo.models.deprecations.base_deprecation import (
    BaseDeprecationChecker,
    DeprecationWarning,
)
from visivo.query.patterns import REF_PROPERTY_PATTERN

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
