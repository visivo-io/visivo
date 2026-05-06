from visivo.models.item import Item
from visivo.models.markdown import Markdown
from visivo.models.base.base_model import REF_PROPERTY_PATTERN
from pydantic import ValidationError
import pytest

EXPECTED_MUTUAL_EXCLUSION_MSG = (
    'Value error, only one of the "markdown", "chart", "table", "input", or "rows" '
    "properties should be set on an item"
)


def test_Source_simple_data():
    data = {"width": 2}
    item = Item(**data)
    assert item.width == 2


def test_Item_both_chart_and_markdown():
    with pytest.raises(ValidationError) as exc_info:
        Item(chart="ref(chart)", markdown="ref(md)")

    error = exc_info.value.errors()[0]
    assert error["msg"] == EXPECTED_MUTUAL_EXCLUSION_MSG
    assert error["type"] == "value_error"


def test_Item_both_chart_and_table():
    with pytest.raises(ValidationError) as exc_info:
        Item(table="ref(table)", markdown="ref(md)")

    error = exc_info.value.errors()[0]
    assert error["msg"] == EXPECTED_MUTUAL_EXCLUSION_MSG
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


# ---------- Item.rows: nested-rows mode ----------


def test_Item_with_rows_parses():
    """Item with `rows` set holds a list of Row objects (row-container mode)."""
    from visivo.models.row import Row

    item = Item(
        width=1,
        rows=[
            {"height": "small", "items": [{"chart": "ref(small_a)"}]},
            {"height": "small", "items": [{"chart": "ref(small_b)"}]},
        ],
    )
    assert item.rows is not None
    assert len(item.rows) == 2
    assert all(isinstance(r, Row) for r in item.rows)
    assert item.rows[0].items[0].chart == "ref(small_a)"


def test_Item_rows_default_None():
    """When `rows` is not provided, the field defaults to None (backwards-compatible)."""
    item = Item(width=2, chart="ref(c)")
    assert item.rows is None


def test_Item_rows_combined_with_chart_rejected():
    """rows + leaf field on the same item raises mutual-exclusion error."""
    with pytest.raises(ValidationError) as exc_info:
        Item(
            chart="ref(c)",
            rows=[{"height": "small", "items": [{"chart": "ref(c2)"}]}],
        )
    error = exc_info.value.errors()[0]
    assert error["msg"] == EXPECTED_MUTUAL_EXCLUSION_MSG


def test_Item_rows_combined_with_markdown_rejected():
    """rows + markdown raises mutual-exclusion error."""
    with pytest.raises(ValidationError) as exc_info:
        Item(
            markdown="ref(md)",
            rows=[{"height": "small", "items": [{"chart": "ref(c)"}]}],
        )
    error = exc_info.value.errors()[0]
    assert error["msg"] == EXPECTED_MUTUAL_EXCLUSION_MSG


def test_Item_rows_combined_with_table_rejected():
    with pytest.raises(ValidationError) as exc_info:
        Item(
            table="ref(t)",
            rows=[{"height": "small", "items": [{"chart": "ref(c)"}]}],
        )
    error = exc_info.value.errors()[0]
    assert error["msg"] == EXPECTED_MUTUAL_EXCLUSION_MSG


def test_Item_rows_combined_with_input_rejected():
    with pytest.raises(ValidationError) as exc_info:
        Item(
            input="ref(in)",
            rows=[{"height": "small", "items": [{"chart": "ref(c)"}]}],
        )
    error = exc_info.value.errors()[0]
    assert error["msg"] == EXPECTED_MUTUAL_EXCLUSION_MSG


def test_Item_rows_with_two_deep_nesting():
    """Deep nesting works: a row inside an item inside a row inside an item."""
    item = Item(
        width=1,
        rows=[
            {
                "height": "medium",
                "items": [
                    {
                        "width": 1,
                        "rows": [
                            {
                                "height": "small",
                                "items": [{"chart": "ref(deep_chart)"}],
                            }
                        ],
                    }
                ],
            }
        ],
    )
    assert item.rows is not None
    inner_item = item.rows[0].items[0]
    assert inner_item.rows is not None
    assert inner_item.rows[0].items[0].chart == "ref(deep_chart)"


def test_Item_rows_child_items_returns_rows():
    """child_items() on a row-container item returns the list of nested Rows."""
    from visivo.models.row import Row

    item = Item(
        width=1,
        rows=[
            {"height": "small", "items": [{"chart": "ref(a)"}]},
            {"height": "small", "items": [{"chart": "ref(b)"}]},
        ],
    )
    children = item.child_items()
    assert len(children) == 2
    assert all(isinstance(c, Row) for c in children)


def test_Item_rows_mixed_with_leaf_siblings_in_parent_row():
    """A leaf item and a row-container item can coexist as siblings of a parent Row."""
    from visivo.models.row import Row

    parent = Row(
        height="large",
        items=[
            {"width": 2, "chart": "ref(big_chart)"},
            {
                "width": 1,
                "rows": [
                    {"height": "small", "items": [{"chart": "ref(small_a)"}]},
                    {"height": "small", "items": [{"chart": "ref(small_b)"}]},
                    {"height": "small", "items": [{"chart": "ref(small_c)"}]},
                ],
            },
        ],
    )
    assert len(parent.items) == 2
    assert parent.items[0].chart == "ref(big_chart)"
    assert parent.items[0].rows is None
    assert parent.items[1].chart is None
    assert parent.items[1].rows is not None
    assert len(parent.items[1].rows) == 3


def test_Item_empty_rows_list_treated_as_set():
    """An empty rows list is technically `is not None`, so combining with a leaf raises.

    This documents existing-validator semantics — the validator uses `is not None`,
    not truthy. Users who want "no sub-layout" should omit the field entirely or pass None.
    """
    # rows: [] is "set" per the validator's `is not None` check.
    # Combining it with a chart should raise.
    with pytest.raises(ValidationError):
        Item(chart="ref(c)", rows=[])


def test_Item_rows_only_with_no_leaf_parses():
    """A row-container item with no leaf fields parses cleanly."""
    item = Item(rows=[{"height": "small", "items": [{"chart": "ref(c)"}]}])
    assert item.chart is None
    assert item.rows is not None
    assert len(item.rows) == 1
