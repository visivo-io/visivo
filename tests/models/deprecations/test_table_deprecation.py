"""Tests for TableDeprecation checker."""

import os
import tempfile

from visivo.models.deprecations.table_deprecation import TableDeprecation


class TestTableDeprecation:
    """Tests for deprecated Table fields detection and migration."""

    def test_can_migrate_returns_true(self):
        checker = TableDeprecation()
        assert checker.can_migrate() is True

    def test_migration_converts_insights_to_data(self):
        with tempfile.TemporaryDirectory() as tmpdir:
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

            assert len(migrations) > 0
            migration = migrations[0]
            assert "insights" in migration.old_text
            assert "data:" in migration.new_text
            assert "ref(monthly-revenue)" in migration.new_text

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

    # ---------------------------------------------------------------------
    # B06: column_defs that carry cell-level styling MUST NOT be deleted
    # automatically — auto-deletion drops user-visible markdown / justify /
    # align / header_name flags that have no equivalent in the 2.0 widget.
    # ---------------------------------------------------------------------

    def test_column_defs_with_markdown_flag_not_deleted(self):
        """Per-cell `markdown: True` (used for <a> link rendering) cannot
        be expressed in a SQL alias. Don't auto-delete the block."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yaml_path = os.path.join(tmpdir, "test.yml")
            with open(yaml_path, "w") as f:
                f.write(
                    """
tables:
  - name: deals-table
    data: ref(deal-rows)
    column_defs:
      - trace_name: deal-trace
        columns:
          - key: "deal_link"
            markdown: True
          - key: "deal_name"
"""
                )

            checker = TableDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            column_def_migrations = [m for m in migrations if "column_defs" in m.old_text]
            assert column_def_migrations == [], (
                "column_defs containing markdown: True must not be auto-deleted; "
                "user must migrate manually"
            )

    def test_column_defs_with_justify_flag_not_deleted(self):
        """`justify` is a per-column alignment hint with no SQL-alias equivalent."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yaml_path = os.path.join(tmpdir, "test.yml")
            with open(yaml_path, "w") as f:
                f.write(
                    """
tables:
  - name: t
    data: ref(rows)
    column_defs:
      - trace_name: t1
        columns:
          - key: "col1"
            justify: center
"""
                )
            checker = TableDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)
            assert [m for m in migrations if "column_defs" in m.old_text] == []

    def test_column_defs_with_align_flag_not_deleted(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            yaml_path = os.path.join(tmpdir, "test.yml")
            with open(yaml_path, "w") as f:
                f.write(
                    """
tables:
  - name: t
    data: ref(rows)
    column_defs:
      - trace_name: t1
        columns:
          - key: "col1"
            align: right
"""
                )
            checker = TableDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)
            assert [m for m in migrations if "column_defs" in m.old_text] == []

    def test_column_defs_with_header_name_not_deleted(self):
        """`header_name` overrides the column header text. The 2.0 widget
        derives headers from SQL aliases, so a header_name override is
        only safe to delete if the user simultaneously aliases the column
        — we can't determine that automatically. Punt to manual review."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yaml_path = os.path.join(tmpdir, "test.yml")
            with open(yaml_path, "w") as f:
                f.write(
                    """
tables:
  - name: t
    data: ref(rows)
    column_defs:
      - trace_name: t1
        columns:
          - key: "col1"
            header_name: "Custom Display Name"
"""
                )
            checker = TableDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)
            assert [m for m in migrations if "column_defs" in m.old_text] == []

    def test_column_defs_without_cell_flags_still_deleted(self):
        """Sanity: a column_defs block that uses only `key` (which the 2.0
        widget can recover from auto-generation) is still auto-deleted."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yaml_path = os.path.join(tmpdir, "test.yml")
            with open(yaml_path, "w") as f:
                f.write(
                    """
tables:
  - name: t
    data: ref(rows)
    column_defs:
      - trace_name: t1
        columns:
          - key: "col1"
          - key: "col2"
"""
                )
            checker = TableDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)
            assert any("column_defs" in m.old_text for m in migrations)
