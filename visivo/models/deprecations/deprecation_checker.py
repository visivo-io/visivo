"""Main deprecation checker that orchestrates all deprecation checks."""

from typing import TYPE_CHECKING, List

from visivo.logger.logger import Logger
from visivo.models.deprecations.base_deprecation import (
    BaseDeprecationChecker,
    DeprecationWarning,
    MigrationAction,
)
from visivo.models.deprecations.env_var_syntax_deprecation import EnvVarSyntaxDeprecation
from visivo.models.deprecations.markdown_deprecation import MarkdownDeprecation
from visivo.models.deprecations.name_format_deprecation import NameFormatDeprecation
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
            EnvVarSyntaxDeprecation(),
            MarkdownDeprecation(),
            NameFormatDeprecation(),
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
        logger.warn("=" * 60)
        logger.warn("DEPRECATION WARNINGS")
        logger.warn("=" * 60)

        for w in warnings:
            location_str = f"\n   Location: {w.location}" if w.location else ""
            logger.warn(
                f"\n[DEPRECATED] {w.feature} (removal: v{w.removal_version})\n"
                f"   {w.message}\n"
                f"   Migration: {w.migration}{location_str}"
            )

        logger.warn("=" * 60)

    def get_all_migrations(self, working_dir: str) -> List[MigrationAction]:
        """
        Collect migrations from all checkers that support automatic migration.

        This method scans files directly rather than requiring a parsed project,
        allowing migration to work even on projects with syntax errors.

        Args:
            working_dir: The directory to scan for YAML files

        Returns:
            List of all migration actions from all checkers
        """
        all_migrations = []
        for checker in self.checkers:
            if checker.can_migrate():
                all_migrations.extend(checker.get_migrations_from_files(working_dir))
        return all_migrations
