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
        Item(chart="ref(chart)", markdown="ref(md)")

    error = exc_info.value.errors()[0]
    assert (
        error["msg"]
        == 'Value error, only one of the "markdown", "chart", "table", "selector", or "input" properties should be set on an item'
    )
    assert error["type"] == "value_error"


def test_Item_both_chart_and_table():
    with pytest.raises(ValidationError) as exc_info:
        Item(table="ref(table)", markdown="ref(md)")

    error = exc_info.value.errors()[0]
    assert (
        error["msg"]
        == 'Value error, only one of the "markdown", "chart", "table", "selector", or "input" properties should be set on an item'
    )
    assert error["type"] == "value_error"


def test_Item_both_chart_and_selector():
    with pytest.raises(ValidationError) as exc_info:
        Item(selector="ref(selector)", markdown="ref(md)")

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
    assert item.markdown == "ref(my-markdown)"


def test_Item_serialize_markdown_model():
    markdown = Markdown(name="test-md", content="# Hello World", align="center", justify="end")
    item = Item(markdown=markdown)
    serialized = item.model_dump()
    assert serialized["markdown"]["content"] == "# Hello World"
    assert serialized["markdown"]["align"] == "center"
    assert serialized["markdown"]["justify"] == "end"


def test_Item_child_items_with_markdown_model():
    markdown = Markdown(name="test-md", content="# Hello World")
    item = Item(markdown=markdown)
    children = item.child_items()
    assert len(children) == 1
    assert isinstance(children[0], Markdown)
