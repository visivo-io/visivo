"""Tests for TableDeprecation checker."""

import os
import tempfile

from visivo.models.deprecations.table_deprecation import TableDeprecation


class TestTableDeprecation:
    """Tests for deprecated Table fields detection and migration."""

    def test_can_migrate_returns_true(self):
        checker = TableDeprecation()
        assert checker.can_migrate() is True

    def test_migration_removes_column_defs(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            yaml_path = os.path.join(tmpdir, "test.yml")
            with open(yaml_path, "w") as f:
                f.write(
                    """
tables:
  - name: revenue-table
    data: ref(monthly-revenue)
    column_defs:
      - trace_name: some-trace
        columns:
          - key: "month"
            header: "Month"
    rows_per_page: 100
"""
                )

            checker = TableDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            assert len(migrations) > 0
            column_def_migrations = [m for m in migrations if "column_defs" in m.old_text]
            assert len(column_def_migrations) > 0
