"""Tests for MarkdownDeprecation checker."""

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
        assert "Markdown model" in markdown_warnings[0].migration

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
