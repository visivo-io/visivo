"""Main deprecation checker that orchestrates all deprecation checks."""

from typing import TYPE_CHECKING, List

from visivo.logger.logger import Logger
from visivo.models.deprecations.base_deprecation import (
    BaseDeprecationChecker,
    DeprecationWarning,
)
from visivo.models.deprecations.ref_syntax_deprecation import RefSyntaxDeprecation
from visivo.models.deprecations.trace_deprecation import TraceDeprecation

if TYPE_CHECKING:
    from visivo.models.project import Project


class DeprecationChecker:
    """
    Main checker that orchestrates all deprecation checks.

    This class runs all deprecation checkers and collects warnings.
    Warnings are non-blocking and don't prevent the build from completing.
    """

    def __init__(self):
        """Initialize the deprecation checker with all checkers."""
        self.checkers: List[BaseDeprecationChecker] = [
            RefSyntaxDeprecation(),
            TraceDeprecation(),
        ]

    def check_all(self, project: "Project") -> List[DeprecationWarning]:
        """
        Run all deprecation checks on the project.

        Args:
            project: The project to check

        Returns:
            List of all deprecation warnings found
        """
        warnings = []
        for checker in self.checkers:
            warnings.extend(checker.check(project))
        return warnings

    def report(self, warnings: List[DeprecationWarning]) -> None:
        """
        Output deprecation warnings to stderr and logger.

        Args:
            warnings: List of deprecation warnings to report
        """
        if not warnings:
            return

        logger = Logger.instance()
        logger.warning("=" * 60)
        logger.warning("DEPRECATION WARNINGS")
        logger.warning("=" * 60)

        for w in warnings:
            location_str = f"\n   Location: {w.location}" if w.location else ""
            logger.warning(
                f"\n[DEPRECATED] {w.feature} (removal: v{w.removal_version})\n"
                f"   {w.message}\n"
                f"   Migration: {w.migration}{location_str}"
            )

        logger.warning("=" * 60)
