"""Deprecation checker for Trace model usage."""

from typing import TYPE_CHECKING, List

from visivo.models.deprecations.base_deprecation import (
    BaseDeprecationChecker,
    DeprecationWarning,
)

if TYPE_CHECKING:
    from visivo.models.project import Project


class TraceDeprecation(BaseDeprecationChecker):
    """
    Warns about Trace usage in favor of Insights.

    Traces are being replaced by Insights which provide more
    powerful client-side data processing with interactions.
    """

    REMOVAL_VERSION = "0.6.0"
    FEATURE_NAME = "Trace"
    MIGRATION_GUIDE = "Convert to Insight. Use 'interactions' for client-side processing."

    def check(self, project: "Project") -> List[DeprecationWarning]:
        """
        Check for deprecated Trace usage.

        Args:
            project: The project to check

        Returns:
            List of deprecation warnings found
        """
        warnings = []

        if not hasattr(project, "traces") or not project.traces:
            return warnings

        for trace in project.traces:
            # Skip refs - only check actual trace objects
            if isinstance(trace, str):
                continue

            trace_name = getattr(trace, "name", None) or getattr(trace, "path", "unnamed")
            trace_path = getattr(trace, "path", None) or ""

            warnings.append(
                DeprecationWarning(
                    feature=self.FEATURE_NAME,
                    message=f"Trace '{trace_name}' uses deprecated Trace model.",
                    migration=self.MIGRATION_GUIDE,
                    removal_version=self.REMOVAL_VERSION,
                    location=trace_path,
                )
            )

        return warnings
