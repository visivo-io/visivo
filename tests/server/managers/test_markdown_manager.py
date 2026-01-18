import pytest
from visivo.server.managers.markdown_manager import MarkdownManager
from visivo.server.managers.object_manager import ObjectStatus


class TestMarkdownManager:
    """Test suite for MarkdownManager class."""

    def test_init_creates_markdown_adapter(self):
        """Test that initialization creates a TypeAdapter for Markdown."""
        manager = MarkdownManager()
        assert manager._markdown_adapter is not None

    def test_validate_object_valid_config(self):
        """Test validate_object with valid markdown configuration."""
        manager = MarkdownManager()
        config = {"name": "test_markdown", "content": "# Hello"}

        markdown = manager.validate_object(config)

        assert markdown is not None
        assert markdown.name == "test_markdown"
        assert markdown.content == "# Hello"

    def test_save_from_config_validates_and_saves(self):
        """Test save_from_config validates and saves markdown."""
        manager = MarkdownManager()
        config = {"name": "new_markdown", "content": "Test content"}

        markdown = manager.save_from_config(config)

        assert markdown.name == "new_markdown"
        assert "new_markdown" in manager.cached_objects
        assert manager.cached_objects["new_markdown"] == markdown

    def test_get_markdown_with_status_cached(self):
        """Test get_markdown_with_status for cached markdown."""
        manager = MarkdownManager()
        config = {"name": "cached_markdown", "content": "Cached"}
        manager.save_from_config(config)

        result = manager.get_markdown_with_status("cached_markdown")

        assert result["name"] == "cached_markdown"
        assert result["status"] == ObjectStatus.NEW.value

    def test_get_markdown_with_status_not_found(self):
        """Test get_markdown_with_status returns None for nonexistent."""
        manager = MarkdownManager()

        result = manager.get_markdown_with_status("nonexistent")

        assert result is None

    def test_validate_config_valid(self):
        """Test validate_config with valid configuration."""
        manager = MarkdownManager()
        config = {"name": "test", "content": "Test"}

        result = manager.validate_config(config)

        assert result["valid"] is True
        assert result["name"] == "test"

    def test_validate_config_invalid(self):
        """Test validate_config with invalid configuration (extra fields)."""
        manager = MarkdownManager()
        config = {"name": "test", "unknown_field": "value"}

        result = manager.validate_config(config)

        assert result["valid"] is False
        assert "error" in result

    def test_get_all_markdowns_only_returns_named_markdowns(self):
        """Test that get_all_markdowns_with_status only returns markdowns with names."""
        manager = MarkdownManager()
        # Add named markdowns
        manager.save_from_config({"name": "markdown_one", "content": "One"})
        manager.save_from_config({"name": "markdown_two", "content": "Two"})

        result = manager.get_all_markdowns_with_status()

        names = [m["name"] for m in result]
        assert "markdown_one" in names
        assert "markdown_two" in names
        assert len(result) == 2

    def test_get_markdowns_list_returns_all_cached_markdowns(self):
        """Test get_markdowns_list returns list of markdown objects."""
        manager = MarkdownManager()
        manager.save_from_config({"name": "md1", "content": "Content 1"})
        manager.save_from_config({"name": "md2", "content": "Content 2"})

        result = manager.get_markdowns_list()

        assert len(result) == 2
        names = [m.name for m in result]
        assert "md1" in names
        assert "md2" in names

    def test_validate_object_without_name(self):
        """Test that markdowns can be created without a name (for inline/embedded use)."""
        manager = MarkdownManager()
        config = {"content": "Inline content"}

        markdown = manager.validate_object(config)

        assert markdown is not None
        assert markdown.name is None
        assert markdown.content == "Inline content"
