"""Deprecation checker for Trace model usage."""

from typing import TYPE_CHECKING, List

from visivo.models.deprecations.base_deprecation import (
    BaseDeprecationChecker,
    DeprecationWarning,
)
from visivo.models.trace import Trace

if TYPE_CHECKING:
    from visivo.models.project import Project


class TraceDeprecation(BaseDeprecationChecker):
    """
    Warns about Trace usage in favor of Insights.

    Traces are being replaced by Insights which provide more
    powerful client-side data processing with interactions.
    """

    REMOVAL_VERSION = "2.0.0"
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

        # Use the project DAG to find all Trace nodes
        traces = project.dag().get_nodes_by_types([Trace], True)

        for trace in traces:
            trace_name = getattr(trace, "name", None) or "unnamed"
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
