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
    - `traces` field -> Use `data` instead
    - `column_defs` -> Auto-generated from data query results
    """

    REMOVAL_VERSION = "2.0.0"

    def check(self, project: "Project") -> List[DeprecationWarning]:
        """Check for deprecated Table fields."""
        warnings = []
        tables = project.dag().get_nodes_by_types([Table], True)

        for table in tables:
            if table.traces:
                warnings.append(
                    DeprecationWarning(
                        feature="Table.traces",
                        message=f"Table '{table.name}' uses deprecated 'traces' field.",
                        migration="Convert traces to insights and use 'data' field.",
                        removal_version=self.REMOVAL_VERSION,
                        location=table.path,
                    )
                )

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
        return True

    def get_migrations_from_files(self, working_dir: str) -> List[MigrationAction]:
        migrations = []

        for root, dirs, files in os.walk(working_dir):
            dirs[:] = [d for d in dirs if not d.startswith(".") and d != "node_modules"]

            for filename in files:
                if filename.endswith((".yml", ".yaml")):
                    file_path = os.path.join(root, filename)
                    file_migrations = self._migrate_file(file_path)
                    if file_migrations:
                        migrations.extend(file_migrations)

        return migrations

    def _migrate_file(self, file_path: str) -> List[MigrationAction]:
        try:
            with open(file_path, "r") as f:
                content = f.read()

            try:
                data = yaml.safe_load(content)
            except yaml.YAMLError:
                return []

            if not data or "tables" not in data:
                return []

            migrations = []

            for table in data["tables"]:
                table_name = table.get("name", "unknown")

                if "column_defs" in table:
                    migration = self._create_remove_column_defs_migration(content, table_name)
                    if migration:
                        migrations.append(migration)

            return migrations

        except (IOError, UnicodeDecodeError):
            return []

    def _create_remove_column_defs_migration(
        self, content: str, table_name: str
    ) -> MigrationAction:
        lines = content.split("\n")
        column_defs_start = None
        column_defs_indent = None

        for i, line in enumerate(lines):
            match = re.match(r"^(\s*)column_defs:\s*$", line)
            if match:
                column_defs_start = i
                column_defs_indent = match.group(1)
                break

        if column_defs_start is None:
            return None

        column_defs_end = column_defs_start
        for i in range(column_defs_start + 1, len(lines)):
            line = lines[i]

            if not line.strip():
                column_defs_end = i
                continue

            line_indent_match = re.match(r"^(\s*)", line)
            if line_indent_match:
                line_indent = line_indent_match.group(1)
                if len(line_indent) <= len(column_defs_indent):
                    break
                column_defs_end = i

        old_lines = lines[column_defs_start : column_defs_end + 1]
        old_text = "\n".join(old_lines)
        new_text = ""

        return MigrationAction(
            file_path="",
            old_text=old_text,
            new_text=new_text,
            description=f"Table '{table_name}': Remove deprecated 'column_defs'",
        )
