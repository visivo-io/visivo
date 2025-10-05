from visivo.models.item import Item
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
