from visivo.models.table import Table
from pydantic import ValidationError
import pytest


def test_Table_simple_data():
    data = {"name": "development"}
    table = Table(**data)
    assert table.name == "development"


def test_Table_with_selector():
    data = {"name": "development", "selector": "ref(Other Selector)"}
    table = Table(**data)
    assert table.selector == "ref(Other Selector)"

    data = {"name": "development", "selector": {"name": "Selector"}}
    table = Table(**data)
    assert table.selector.name == "Selector"


def test_Table_with_data_insight_ref():
    data = {
        "name": "revenue-table",
        "data": "ref(monthly-revenue)",
    }
    table = Table(**data)
    assert table.data == "ref(monthly-revenue)"
    assert table.name == "revenue-table"


def test_Table_with_data_model_ref():
    data = {
        "name": "model-table",
        "data": "ref(my-model)",
    }
    table = Table(**data)
    assert table.data == "ref(my-model)"


def test_Table_with_data_inline_model():
    data = {
        "name": "inline-model-table",
        "data": {"sql": "select * from orders", "name": "inline-model"},
    }
    table = Table(**data)
    assert table.data.name == "inline-model"


def test_Table_data_and_columns_mutually_exclusive():
    data = {
        "name": "bad-table",
        "data": "ref(my-insight)",
        "columns": ["${ref(my-insight).x}"],
    }
    with pytest.raises(ValidationError) as exc_info:
        Table(**data)
    assert "cannot be combined" in str(exc_info.value).lower()


def test_Table_with_columns_only():
    data = {
        "name": "select-table",
        "columns": [
            "${ref(sales-insight).region} as Region",
            "${ref(sales-insight).revenue} as Revenue",
        ],
    }
    table = Table(**data)
    assert len(table.columns) == 2


def test_Table_with_pivot_config():
    data = {
        "name": "pivot-table",
        "columns": ["${ref(sales-insight).region}"],
        "rows": ["${ref(sales-insight).product}"],
        "values": ["sum(${ref(sales-insight).revenue})"],
    }
    table = Table(**data)
    assert table.columns == ["${ref(sales-insight).region}"]
    assert table.rows == ["${ref(sales-insight).product}"]
    assert table.values == ["sum(${ref(sales-insight).revenue})"]


def test_Table_rows_requires_values():
    data = {
        "name": "bad-pivot",
        "columns": ["${ref(sales-insight).region}"],
        "rows": ["${ref(sales-insight).product}"],
    }
    with pytest.raises(ValidationError) as exc_info:
        Table(**data)
    assert "together" in str(exc_info.value).lower()


def test_Table_values_requires_rows():
    data = {
        "name": "bad-pivot",
        "columns": ["${ref(sales-insight).region}"],
        "values": ["sum(${ref(sales-insight).revenue})"],
    }
    with pytest.raises(ValidationError) as exc_info:
        Table(**data)
    assert "together" in str(exc_info.value).lower()


def test_Table_rows_values_require_columns():
    data = {
        "name": "bad-pivot",
        "rows": ["${ref(sales-insight).product}"],
        "values": ["sum(${ref(sales-insight).revenue})"],
    }
    with pytest.raises(ValidationError) as exc_info:
        Table(**data)
    assert "columns" in str(exc_info.value).lower()


def test_Table_with_format_cells():
    data = {
        "name": "formatted-table",
        "data": "ref(my-insight)",
        "format_cells": {
            "scope": "column",
            "min_color": "#ff0000",
            "max_color": "#00ff00",
        },
    }
    table = Table(**data)
    assert table.format_cells.scope.value == "column"
    assert table.format_cells.min_color == "#ff0000"
    assert table.format_cells.max_color == "#00ff00"


def test_Table_with_pivot_and_format_cells():
    data = {
        "name": "pivot-formatted",
        "columns": ["${ref(sales-insight).region}"],
        "rows": ["${ref(sales-insight).product}"],
        "values": ["sum(${ref(sales-insight).revenue})"],
        "format_cells": {
            "scope": "table",
            "min_color": "#000000",
            "max_color": "#ffffff",
        },
    }
    table = Table(**data)
    assert table.columns is not None
    assert table.format_cells is not None


def test_Table_data_no_pivot_fields():
    data = {
        "name": "simple-table",
        "data": "ref(my-insight)",
    }
    table = Table(**data)
    assert table.columns is None
    assert table.rows is None
    assert table.values is None


def test_Table_serialization_with_pivot():
    data = {
        "name": "pivot-table",
        "columns": ["${ref(sales-insight).region}"],
        "rows": ["${ref(sales-insight).product}"],
        "values": ["sum(${ref(sales-insight).revenue})"],
        "format_cells": {
            "scope": "column",
            "min_color": "#ff0000",
            "max_color": "#00ff00",
        },
    }
    table = Table(**data)
    serialized = table.model_dump(exclude_none=True, mode="json")
    assert serialized["columns"] == ["${ref(sales-insight).region}"]
    assert serialized["rows"] == ["${ref(sales-insight).product}"]
    assert serialized["values"] == ["sum(${ref(sales-insight).revenue})"]
    assert serialized["format_cells"]["scope"] == "column"


def test_Table_child_items_with_data():
    table = Table(name="test", data="ref(my-insight)")
    items = table.child_items()
    assert "ref(my-insight)" in items


def test_Table_child_items_with_columns():
    table = Table(
        name="test",
        columns=["${ref(insight-a).x}", "${ref(insight-b).y}"],
    )
    items = table.child_items()
    ref_items = [i for i in items if isinstance(i, str) and i.startswith("ref(")]
    ref_names = {r.replace("ref(", "").replace(")", "") for r in ref_items}
    assert "insight-a" in ref_names
    assert "insight-b" in ref_names


def test_Table_child_items_with_pivot():
    table = Table(
        name="test",
        columns=["${ref(insight).region}"],
        rows=["${ref(insight).product}"],
        values=["sum(${ref(insight).revenue})"],
    )
    items = table.child_items()
    ref_items = [i for i in items if isinstance(i, str) and i.startswith("ref(")]
    assert len(ref_items) == 1
    assert "ref(insight)" in ref_items
