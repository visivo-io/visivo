"""Tests for MarkdownDeprecation checker."""

import os
import tempfile

from visivo.models.deprecations.markdown_deprecation import MarkdownDeprecation
from visivo.models.project import Project
from visivo.models.markdown import Markdown
from visivo.models.item import Item
from visivo.models.row import Row
from visivo.models.dashboard import Dashboard


class TestMarkdownDeprecation:
    """Tests for deprecated inline markdown string detection."""

    def test_no_warning_when_no_markdown(self):
        """Test that project without markdown items has no warnings."""
        dashboard = Dashboard(name="test-dashboard", rows=[], type="internal")
        project = Project(
            name="test_project",
            dashboards=[dashboard],
        )

        checker = MarkdownDeprecation()
        warnings = checker.check(project)
        # Filter to only markdown deprecation warnings
        markdown_warnings = [w for w in warnings if w.feature == "Inline markdown string on Item"]
        assert len(markdown_warnings) == 0

    def test_no_warning_when_using_markdown_model_ref(self):
        """Test that using a ref to a Markdown model doesn't trigger warnings."""
        markdown = Markdown(name="my-markdown", content="# Hello World")
        # Use ref string to reference the markdown
        item = Item(markdown="ref(my-markdown)")
        row = Row(items=[item])
        dashboard = Dashboard(name="test-dashboard", rows=[row], type="internal")

        project = Project(
            name="test_project",
            markdowns=[markdown],
            dashboards=[dashboard],
        )

        checker = MarkdownDeprecation()
        warnings = checker.check(project)
        # Filter to only markdown deprecation warnings
        markdown_warnings = [w for w in warnings if w.feature == "Inline markdown string on Item"]
        # ref() usage should not trigger warnings
        assert len(markdown_warnings) == 0

    def test_warns_on_legacy_inline_markdown(self):
        """Test that legacy inline markdown string triggers a warning."""
        # Create item with legacy inline markdown
        item = Item(markdown="# Hello World")
        row = Row(items=[item])
        dashboard = Dashboard(name="test-dashboard", rows=[row], type="internal")

        project = Project(
            name="test_project",
            dashboards=[dashboard],
        )

        checker = MarkdownDeprecation()
        warnings = checker.check(project)
        # Filter to only markdown deprecation warnings
        markdown_warnings = [w for w in warnings if w.feature == "Inline markdown string on Item"]

        assert len(markdown_warnings) == 1
        assert "inline markdown string" in markdown_warnings[0].message.lower()
        assert markdown_warnings[0].removal_version == "2.0.0"
        assert "content" in markdown_warnings[0].migration.lower()

    def test_warns_on_multiple_legacy_markdown_items(self):
        """Test that multiple legacy markdown items each trigger a warning."""
        item1 = Item(markdown="# Title 1")
        item2 = Item(markdown="# Title 2")
        row = Row(items=[item1, item2])
        dashboard = Dashboard(name="test-dashboard", rows=[row], type="internal")

        project = Project(
            name="test_project",
            dashboards=[dashboard],
        )

        checker = MarkdownDeprecation()
        warnings = checker.check(project)
        # Filter to only markdown deprecation warnings
        markdown_warnings = [w for w in warnings if w.feature == "Inline markdown string on Item"]

        assert len(markdown_warnings) == 2

    def test_can_migrate_returns_true(self):
        """Test that the checker supports migration."""
        checker = MarkdownDeprecation()
        assert checker.can_migrate() is True

    def test_no_warning_for_markdown_ref(self):
        """Test that using ref() to reference a Markdown doesn't trigger deprecation."""
        # When using ref(), the markdown field stays as a string (the ref)
        # and doesn't get converted to a Markdown model
        markdown = Markdown(name="my-markdown", content="# Hello")
        item = Item(markdown="ref(my-markdown)")
        row = Row(items=[item])
        dashboard = Dashboard(name="test-dashboard", rows=[row], type="internal")

        project = Project(
            name="test_project",
            markdowns=[markdown],
            dashboards=[dashboard],
        )

        checker = MarkdownDeprecation()
        warnings = checker.check(project)
        # Filter to only markdown deprecation warnings
        markdown_warnings = [w for w in warnings if w.feature == "Inline markdown string on Item"]

        # ref() usage should not trigger warnings
        assert len(markdown_warnings) == 0


class TestMarkdownMigration:
    """Tests for inline markdown migration functionality."""

    def test_migration_converts_inline_markdown(self):
        """Test that migration converts inline markdown to Markdown model."""
        yaml_content = """dashboards:
  - name: test-dashboard
    rows:
      - items:
          - markdown: "# Hello World"
"""
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = os.path.join(tmpdir, "project.visivo.yml")
            with open(file_path, "w") as f:
                f.write(yaml_content)

            checker = MarkdownDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            assert len(migrations) == 1
            migration = migrations[0]
            assert migration.file_path == file_path
            assert "content:" in migration.new_text
            assert "# Hello World" in migration.new_text

    def test_migration_preserves_align_and_justify(self):
        """Test that migration moves align and justify into the Markdown model."""
        yaml_content = """dashboards:
  - name: test-dashboard
    rows:
      - items:
          - markdown: "# Centered"
            align: center
            justify: end
"""
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = os.path.join(tmpdir, "project.visivo.yml")
            with open(file_path, "w") as f:
                f.write(yaml_content)

            checker = MarkdownDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            assert len(migrations) == 1
            new_text = migrations[0].new_text

            # Check that content, align, and justify are in the new format
            assert 'content: "# Centered"' in new_text
            assert "align: center" in new_text
            assert "justify: end" in new_text

    def test_migration_handles_multiline_markdown(self):
        """Test that migration handles multiline markdown content."""
        yaml_content = """dashboards:
  - name: test-dashboard
    rows:
      - items:
          - markdown: |
              # Welcome

              This is **formatted** text.
"""
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = os.path.join(tmpdir, "project.visivo.yml")
            with open(file_path, "w") as f:
                f.write(yaml_content)

            checker = MarkdownDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            assert len(migrations) == 1
            new_text = migrations[0].new_text

            # Check that content uses block scalar
            assert "content: |" in new_text
            assert "# Welcome" in new_text
            assert "**formatted**" in new_text

    def test_migration_handles_multiple_inline_markdowns(self):
        """Test that migration handles multiple inline markdowns in one file."""
        yaml_content = """dashboards:
  - name: test-dashboard
    rows:
      - items:
          - markdown: "# First"
          - markdown: "# Second"
"""
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = os.path.join(tmpdir, "project.visivo.yml")
            with open(file_path, "w") as f:
                f.write(yaml_content)

            checker = MarkdownDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            # Should have one migration per inline markdown
            assert len(migrations) == 2

    def test_migration_skips_ref_markdowns(self):
        """Test that migration skips items that already use ref()."""
        yaml_content = """markdowns:
  - name: existing-markdown
    content: "# Existing"

dashboards:
  - name: test-dashboard
    rows:
      - items:
          - markdown: ref(existing-markdown)
"""
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = os.path.join(tmpdir, "project.visivo.yml")
            with open(file_path, "w") as f:
                f.write(yaml_content)

            checker = MarkdownDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            # No migrations needed since the markdown already uses ref()
            assert len(migrations) == 0

    def test_migration_skips_already_migrated(self):
        """Test that migration skips items already in the new format."""
        yaml_content = """dashboards:
  - name: test-dashboard
    rows:
      - items:
          - markdown:
              content: "# Already migrated"
              align: center
"""
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = os.path.join(tmpdir, "project.visivo.yml")
            with open(file_path, "w") as f:
                f.write(yaml_content)

            checker = MarkdownDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            # No migrations needed since already in new format
            assert len(migrations) == 0

    def test_migration_skips_non_yaml_files(self):
        """Test that migration skips non-YAML files."""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create a non-YAML file
            file_path = os.path.join(tmpdir, "readme.md")
            with open(file_path, "w") as f:
                f.write("# This is markdown content but not YAML")

            checker = MarkdownDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            assert len(migrations) == 0

    def test_migration_output_format(self):
        """Test that migration output has correct indentation."""
        yaml_content = """dashboards:
  - name: test-dashboard
    rows:
      - items:
          - markdown: "# Hello"
            align: right
"""
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = os.path.join(tmpdir, "project.visivo.yml")
            with open(file_path, "w") as f:
                f.write(yaml_content)

            checker = MarkdownDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            assert len(migrations) == 1
            new_text = migrations[0].new_text

            # Verify proper indentation structure
            lines = new_text.split("\n")
            assert lines[0] == "          - markdown:"
            assert lines[1] == '              content: "# Hello"'
            assert lines[2] == "              align: right"

    def test_migration_handles_empty_markdown(self):
        """Test that migration handles empty markdown strings."""
        yaml_content = """dashboards:
  - name: test-dashboard
    rows:
      - items:
          - markdown: ""
"""
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = os.path.join(tmpdir, "project.visivo.yml")
            with open(file_path, "w") as f:
                f.write(yaml_content)

            checker = MarkdownDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            # Empty markdown should still be migrated
            assert len(migrations) == 1
            assert 'content: ""' in migrations[0].new_text

    def test_migration_handles_markdown_as_property(self):
        """Test that migration handles markdown as a property within an item (not first property)."""
        yaml_content = """dashboards:
  - name: test-dashboard
    rows:
      - height: medium
        items:
          - width: 1
            markdown: |
              ## Sub heading
              1. Numbered
              1. Lists are cool

              But we can have lots of other _content_ as well
          - width: 3
"""
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = os.path.join(tmpdir, "project.visivo.yml")
            with open(file_path, "w") as f:
                f.write(yaml_content)

            checker = MarkdownDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            assert len(migrations) == 1
            new_text = migrations[0].new_text

            # Check the structure - markdown should become an object with content
            assert "markdown:" in new_text
            assert "content: |" in new_text
            assert "## Sub heading" in new_text
            assert "Numbered" in new_text

    def test_migration_handles_markdown_property_with_align(self):
        """Test that migration handles markdown as property with align/justify."""
        yaml_content = """dashboards:
  - name: test-dashboard
    rows:
      - items:
          - width: 2
            markdown: "# Centered Title"
            align: center
            justify: end
"""
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = os.path.join(tmpdir, "project.visivo.yml")
            with open(file_path, "w") as f:
                f.write(yaml_content)

            checker = MarkdownDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            assert len(migrations) == 1
            new_text = migrations[0].new_text

            # Should have markdown as object with content, align, justify nested
            lines = new_text.split("\n")
            assert "            markdown:" in lines[0]
            assert 'content: "# Centered Title"' in new_text
            assert "align: center" in new_text
            assert "justify: end" in new_text
