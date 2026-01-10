from visivo.models.item import Item
from visivo.models.markdown import Markdown
from visivo.models.base.base_model import REF_PROPERTY_PATTERN
from pydantic import ValidationError
import pytest


def test_Source_simple_data():
    data = {"width": 2}
    item = Item(**data)
    assert item.width == 2


def test_Item_both_chart_and_markdown():
    with pytest.raises(ValidationError) as exc_info:
        Item(chart="ref(chart)", markdown="markdown")

    error = exc_info.value.errors()[0]
    assert (
        error["msg"]
        == 'Value error, only one of the "markdown", "chart", "table", "selector", or "input" properties should be set on an item'
    )
    assert error["type"] == "value_error"


def test_Item_chart_and_align():
    with pytest.raises(ValidationError) as exc_info:
        Item(chart="ref(chart)", align="right")

    error = exc_info.value.errors()[0]
    assert "property can only be set when" in error["msg"]
    assert error["type"] == "value_error"


def test_Item_both_chart_and_table():
    with pytest.raises(ValidationError) as exc_info:
        Item(table="ref(table)", markdown="markdown")

    error = exc_info.value.errors()[0]
    assert (
        error["msg"]
        == 'Value error, only one of the "markdown", "chart", "table", "selector", or "input" properties should be set on an item'
    )
    assert error["type"] == "value_error"


def test_Item_both_chart_and_selector():
    with pytest.raises(ValidationError) as exc_info:
        Item(selector="ref(selector)", markdown="markdown")

    error = exc_info.value.errors()[0]
    assert (
        error["msg"]
        == 'Value error, only one of the "markdown", "chart", "table", "selector", or "input" properties should be set on an item'
    )
    assert error["type"] == "value_error"


def test_Item_invalid_ref_string():
    item = Item(chart="ref(chart)")
    item.chart = "ref(chart)"
    with pytest.raises(ValidationError) as exc_info:
        Item(chart="ref(chart")

    error = exc_info.value.errors()[0]
    assert error["msg"] == f"String should match pattern '{REF_PROPERTY_PATTERN}'"
    assert error["type"] == "string_pattern_mismatch"


# New tests for Markdown model integration


def test_Item_with_markdown_model():
    """Test that Item can accept an inline Markdown model."""
    markdown = Markdown(name="test-md", content="# Hello World", align="center", justify="end")
    item = Item(markdown=markdown)
    assert isinstance(item.markdown, Markdown)
    assert item.markdown.content == "# Hello World"
    assert item.markdown.align == "center"
    assert item.markdown.justify == "end"


def test_Item_with_markdown_ref():
    """Test that Item can accept a ref to a Markdown model."""
    item = Item(markdown="ref(my-markdown)")
    # ref strings are preserved as strings
    assert item.markdown == "ref(my-markdown)"


def test_Item_with_legacy_inline_markdown():
    """Test backwards compatibility - legacy inline markdown string is converted to Markdown model."""
    item = Item(markdown="# Hello World")
    # Legacy markdown is converted to Markdown model
    assert isinstance(item.markdown, Markdown)
    assert item.markdown.content == "# Hello World"
    # Default alignment values are applied
    assert item.markdown.align == "left"
    assert item.markdown.justify == "start"


def test_Item_with_legacy_inline_markdown_and_align():
    """Test backwards compatibility - legacy inline markdown with align property."""
    item = Item(markdown="# Hello World", align="center")
    # Legacy markdown is converted to Markdown model with custom align
    assert isinstance(item.markdown, Markdown)
    assert item.markdown.content == "# Hello World"
    assert item.markdown.align == "center"
    assert item.markdown.justify == "start"
    # The deprecated fields on Item should be cleared
    assert item.align is None


def test_Item_with_legacy_inline_markdown_and_justify():
    """Test backwards compatibility - legacy inline markdown with justify property."""
    item = Item(markdown="# Hello World", justify="center")
    # Legacy markdown is converted to Markdown model with custom justify
    assert isinstance(item.markdown, Markdown)
    assert item.markdown.content == "# Hello World"
    assert item.markdown.align == "left"
    assert item.markdown.justify == "center"
    # The deprecated fields on Item should be cleared
    assert item.justify is None


def test_Item_with_legacy_inline_markdown_align_and_justify():
    """Test backwards compatibility - legacy inline markdown with both align and justify."""
    item = Item(markdown="# Hello World", align="right", justify="end")
    assert isinstance(item.markdown, Markdown)
    assert item.markdown.content == "# Hello World"
    assert item.markdown.align == "right"
    assert item.markdown.justify == "end"
    # The deprecated fields on Item should be cleared
    assert item.align is None
    assert item.justify is None


def test_Item_serialize_markdown_model():
    """Test that serialization outputs the Markdown model for frontend."""
    markdown = Markdown(name="test-md", content="# Hello World", align="center", justify="end")
    item = Item(markdown=markdown)
    serialized = item.model_dump()
    # Frontend expects the full Markdown model with content, align, justify
    assert serialized["markdown"]["content"] == "# Hello World"
    assert serialized["markdown"]["align"] == "center"
    assert serialized["markdown"]["justify"] == "end"
    # Item-level align/justify should be None (not duplicated)
    assert serialized["align"] is None
    assert serialized["justify"] is None


def test_Item_serialize_legacy_markdown():
    """Test that legacy markdown is converted and serializes correctly for frontend."""
    item = Item(markdown="# Hello World", align="right")
    serialized = item.model_dump()
    # Legacy markdown is converted to Markdown model, so frontend gets the model
    assert serialized["markdown"]["content"] == "# Hello World"
    assert serialized["markdown"]["align"] == "right"
    assert serialized["markdown"]["justify"] == "start"
    # Item-level align/justify should be None (moved to Markdown model)
    assert serialized["align"] is None
    assert serialized["justify"] is None


def test_Item_child_items_with_markdown_model():
    """Test that Markdown model is included in child_items()."""
    markdown = Markdown(name="test-md", content="# Hello World")
    item = Item(markdown=markdown)
    children = item.child_items()
    assert len(children) == 1
    assert isinstance(children[0], Markdown)


def test_Item_justify_without_markdown():
    """Test that justify cannot be set without markdown."""
    with pytest.raises(ValidationError) as exc_info:
        Item(chart="ref(chart)", justify="center")

    error = exc_info.value.errors()[0]
    assert "property can only be set when" in error["msg"]
    assert error["type"] == "value_error"
