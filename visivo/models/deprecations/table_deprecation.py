"""Deprecation checker for Table model fields."""

import os
import re
from typing import TYPE_CHECKING, List

import yaml

from visivo.models.deprecations.base_deprecation import (
    BaseDeprecationChecker,
    DeprecationWarning,
    MigrationAction,
)
from visivo.models.table import Table

if TYPE_CHECKING:
    from visivo.models.project import Project


class TableDeprecation(BaseDeprecationChecker):
    """
    Warns about deprecated Table fields and provides migrations.

    The Table model is being simplified:
    - `traces` field → Use `insight` instead
    - `insights` (plural) → Use singular `insight`
    - `column_defs` → Auto-generated from insight query results

    Old (deprecated):
    ```yaml
    tables:
      - name: revenue-table
        insights:
          - ref(monthly-revenue)
        column_defs:
          - insight_name: monthly-revenue
            columns:
              - key: "month"
                header: "Month"
    ```

    New:
    ```yaml
    tables:
      - name: revenue-table
        insight: ref(monthly-revenue)
    ```
    """

    REMOVAL_VERSION = "2.0.0"

    def check(self, project: "Project") -> List[DeprecationWarning]:
        """Check for deprecated Table fields."""
        warnings = []
        tables = project.dag().get_nodes_by_types([Table], True)

        for table in tables:
            # Check for plural insights
            if table.insights and len(table.insights) > 1:
                warnings.append(
                    DeprecationWarning(
                        feature="Table.insights (plural with multiple items)",
                        message=f"Table '{table.name}' has multiple insights.",
                        migration="Use single 'insight: ref(name)' field.",
                        removal_version=self.REMOVAL_VERSION,
                        location=table.path,
                    )
                )
            elif table.insights and len(table.insights) == 1:
                warnings.append(
                    DeprecationWarning(
                        feature="Table.insights (plural)",
                        message=f"Table '{table.name}' uses plural 'insights'.",
                        migration="Use 'insight: ref(name)' instead.",
                        removal_version=self.REMOVAL_VERSION,
                        location=table.path,
                    )
                )

            # Check for traces
            if table.traces:
                warnings.append(
                    DeprecationWarning(
                        feature="Table.traces",
                        message=f"Table '{table.name}' uses deprecated 'traces' field.",
                        migration="Convert traces to insights. Manual migration required.",
                        removal_version=self.REMOVAL_VERSION,
                        location=table.path,
                    )
                )

            # Check for column_defs
            if table.column_defs:
                warnings.append(
                    DeprecationWarning(
                        feature="Table.column_defs",
                        message=f"Table '{table.name}' uses 'column_defs'.",
                        migration="Remove column_defs. Columns auto-generated. Use SQL aliases for custom headers.",
                        removal_version=self.REMOVAL_VERSION,
                        location=table.path,
                    )
                )

        return warnings

    def can_migrate(self) -> bool:
        """Return True - this deprecation supports automatic migration."""
        return True

    def get_migrations_from_files(self, working_dir: str) -> List[MigrationAction]:
        """
        Scan YAML files and create migration actions.

        This auto-converts:
        - insights (plural) → insight (singular) if only one insight
        - Removes column_defs

        Manual migration needed for traces.
        """
        migrations = []

        for root, dirs, files in os.walk(working_dir):
            # Skip hidden directories
            dirs[:] = [d for d in dirs if not d.startswith(".") and d != "node_modules"]

            for filename in files:
                if filename.endswith((".yml", ".yaml")):
                    file_path = os.path.join(root, filename)
                    file_migrations = self._migrate_file(file_path)
                    if file_migrations:
                        migrations.extend(file_migrations)

        return migrations

    def _migrate_file(self, file_path: str) -> List[MigrationAction]:
        """Migrate a single YAML file."""
        try:
            with open(file_path, "r") as f:
                content = f.read()

            # Parse YAML to find tables
            try:
                data = yaml.safe_load(content)
            except yaml.YAMLError:
                return []

            if not data or "tables" not in data:
                return []

            # Track all migrations for this file
            migrations = []

            for table in data["tables"]:
                table_name = table.get("name", "unknown")
                table_migrations = []

                # Migration 1: Convert insights (plural) → insight (singular)
                if "insights" in table and isinstance(table["insights"], list):
                    if len(table["insights"]) == 1:
                        insight_value = table["insights"][0]
                        table_migrations.append(
                            self._create_insights_to_insight_migration(
                                content, table_name, insight_value
                            )
                        )

                # Migration 2: Remove column_defs
                if "column_defs" in table:
                    table_migrations.append(
                        self._create_remove_column_defs_migration(content, table_name)
                    )

                # Add all migrations found for this table
                for migration in table_migrations:
                    if migration:
                        migrations.append(migration)

            return migrations

        except (IOError, UnicodeDecodeError):
            return []

    def _create_insights_to_insight_migration(
        self, content: str, table_name: str, insight_value: str
    ) -> MigrationAction:
        """Create migration to convert insights (plural) to insight (singular)."""
        # Pattern to match:
        #   insights:
        #     - ref(...)
        # Or:
        #   insights: [ref(...)]
        #
        # We want to convert to:
        #   insight: ref(...)

        # Try multi-line format first
        pattern_multiline = re.compile(
            rf"^(\s*)insights:\s*\n\s*-\s+({re.escape(insight_value)})\s*$",
            re.MULTILINE,
        )
        match = pattern_multiline.search(content)

        if match:
            indent = match.group(1)
            old_text = match.group(0)
            new_text = f"{indent}insight: {insight_value}"

            return MigrationAction(
                file_path="",  # Will be set by caller
                old_text=old_text,
                new_text=new_text,
                description=f"Table '{table_name}': Convert 'insights' (plural) to 'insight' (singular)",
            )

        # Try single-line format: insights: [ref(...)]
        pattern_singleline = re.compile(
            rf"^(\s*)insights:\s*\[({re.escape(insight_value)})\]\s*$", re.MULTILINE
        )
        match = pattern_singleline.search(content)

        if match:
            indent = match.group(1)
            old_text = match.group(0)
            new_text = f"{indent}insight: {insight_value}"

            return MigrationAction(
                file_path="",
                old_text=old_text,
                new_text=new_text,
                description=f"Table '{table_name}': Convert 'insights' (plural) to 'insight' (singular)",
            )

        return None

    def _create_remove_column_defs_migration(
        self, content: str, table_name: str
    ) -> MigrationAction:
        """Create migration to remove column_defs block."""
        # Pattern to match the entire column_defs block:
        #   column_defs:
        #     - insight_name: ...
        #       columns:
        #         - key: ...
        #           header: ...
        #
        # This is tricky because it can span multiple lines with nested content.
        # We'll use a simpler approach: find "column_defs:" and remove everything
        # until we hit a line with equal or less indentation.

        lines = content.split("\n")
        column_defs_start = None
        column_defs_indent = None

        # Find the column_defs line
        for i, line in enumerate(lines):
            match = re.match(r"^(\s*)column_defs:\s*$", line)
            if match:
                column_defs_start = i
                column_defs_indent = match.group(1)
                break

        if column_defs_start is None:
            return None

        # Find the end of the column_defs block
        column_defs_end = column_defs_start
        for i in range(column_defs_start + 1, len(lines)):
            line = lines[i]

            # Empty lines are part of the block
            if not line.strip():
                column_defs_end = i
                continue

            # Check indentation
            line_indent_match = re.match(r"^(\s*)", line)
            if line_indent_match:
                line_indent = line_indent_match.group(1)

                # If line has same or less indentation, we've left the block
                if len(line_indent) <= len(column_defs_indent):
                    break

                # Otherwise, this line is part of the block
                column_defs_end = i

        # Extract the old text (including trailing newline)
        old_lines = lines[column_defs_start : column_defs_end + 1]
        old_text = "\n".join(old_lines)

        # New text is empty (we're removing the block)
        new_text = ""

        return MigrationAction(
            file_path="",
            old_text=old_text,
            new_text=new_text,
            description=f"Table '{table_name}': Remove deprecated 'column_defs'",
        )
