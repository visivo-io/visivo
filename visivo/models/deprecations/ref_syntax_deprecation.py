"""Deprecation checker for raw ref(name) syntax."""

import re
from typing import TYPE_CHECKING, List

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

    REMOVAL_VERSION = "0.5.0"
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

        # Walk through all project objects looking for bare ref patterns
        for item in self._get_all_items(project):
            item_warnings = self._check_item(item, bare_ref_pattern)
            warnings.extend(item_warnings)

        return warnings

    def _get_all_items(self, project: "Project") -> list:
        """Get all items from the project that might contain refs."""
        items = []

        # Models (common place for bare refs in source field)
        if hasattr(project, "models") and project.models:
            items.extend(project.models)

        # Traces
        if hasattr(project, "traces") and project.traces:
            items.extend(project.traces)

        # Charts
        if hasattr(project, "charts") and project.charts:
            items.extend(project.charts)

        # Dashboards
        if hasattr(project, "dashboards") and project.dashboards:
            items.extend(project.dashboards)

        # Tables
        if hasattr(project, "tables") and project.tables:
            items.extend(project.tables)

        # Selectors
        if hasattr(project, "selectors") and project.selectors:
            items.extend(project.selectors)

        # Insights
        if hasattr(project, "insights") and project.insights:
            items.extend(project.insights)

        # Alerts
        if hasattr(project, "alerts") and project.alerts:
            items.extend(project.alerts)

        return items

    def _check_item(self, item, pattern: re.Pattern) -> List[DeprecationWarning]:
        """Check a single item for bare ref patterns."""
        warnings = []

        # Check if the item itself is a bare ref string
        if isinstance(item, str) and pattern.match(item):
            warnings.append(self._create_warning(item, getattr(item, "path", None)))
            return warnings

        # For Pydantic models, check their field values
        if hasattr(item, "model_dump"):
            self._check_dict_recursive(
                item.model_dump(exclude_none=True),
                pattern,
                warnings,
                getattr(item, "path", None),
            )

        return warnings

    def _check_dict_recursive(
        self,
        data: dict,
        pattern: re.Pattern,
        warnings: List[DeprecationWarning],
        location: str = None,
    ) -> None:
        """Recursively check a dictionary for bare ref patterns."""
        if isinstance(data, dict):
            for key, value in data.items():
                if isinstance(value, str) and pattern.match(value):
                    loc = f"{location}.{key}" if location else key
                    warnings.append(self._create_warning(value, loc))
                elif isinstance(value, dict):
                    self._check_dict_recursive(value, pattern, warnings, location)
                elif isinstance(value, list):
                    for idx, item in enumerate(value):
                        self._check_dict_recursive(item, pattern, warnings, location)
        elif isinstance(data, str) and pattern.match(data):
            warnings.append(self._create_warning(data, location))

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
