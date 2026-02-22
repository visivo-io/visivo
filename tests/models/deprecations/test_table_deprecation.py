"""Tests for TableDeprecation checker."""

import os
import tempfile

from visivo.models.deprecations.table_deprecation import TableDeprecation
from visivo.models.project import Project
from visivo.models.table import Table
from visivo.models.dashboard import Dashboard


class TestTableDeprecation:
    """Tests for deprecated Table fields detection and migration."""

    def test_can_migrate_returns_true(self):
        """Test that the checker supports migration."""
        checker = TableDeprecation()
        assert checker.can_migrate() is True

    def test_migration_converts_plural_to_singular(self):
        """Test that migration can convert plural insights to singular."""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create a test YAML file
            yaml_path = os.path.join(tmpdir, "test.yml")
            with open(yaml_path, "w") as f:
                f.write(
                    """
tables:
  - name: revenue-table
    insights:
      - ref(monthly-revenue)
    rows_per_page: 100
"""
                )

            checker = TableDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            # Should find one migration
            assert len(migrations) > 0

            # The migration should convert insights to insight
            migration = migrations[0]
            assert "insights" in migration.old_text.lower()
            assert "insight:" in migration.new_text.lower()

    def test_migration_removes_column_defs(self):
        """Test that migration can remove column_defs blocks."""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create a test YAML file
            yaml_path = os.path.join(tmpdir, "test.yml")
            with open(yaml_path, "w") as f:
                f.write(
                    """
tables:
  - name: revenue-table
    insight: ref(monthly-revenue)
    column_defs:
      - insight_name: monthly-revenue
        columns:
          - key: "month"
            header: "Month"
    rows_per_page: 100
"""
                )

            checker = TableDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            # Should find migration for column_defs removal
            assert len(migrations) > 0

            # Check that column_defs appears in old_text
            column_def_migrations = [m for m in migrations if "column_defs" in m.old_text]
            assert len(column_def_migrations) > 0
