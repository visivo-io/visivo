from visivo.models.table import Table
from visivo.models.base.base_model import REF_REGEX
from pydantic import ValidationError
import pytest


def test_Table_simple_data():
    data = {"name": "development", "column_defs": []}
    table = Table(**data)
    assert table.name == "development"


def test_Table_with_trace_simple_data():
    data = {
        "name": "development",
        "column_defs": [],
        "traces": [
            {
                "name": "Trace Name",
                "props": {"type": "scatter", "x": "?{x)", "y": "query(y}"},
                "model": {"sql": "select * from table"},
            }
        ],
    }
    table = Table(**data)
    assert table.name == "development"


def test_Table_with_columns_with_header():
    data = {
        "name": "development",
        "traces": [
            {
                "name": "Trace Name",
                "props": {"type": "scatter", "x": "?{x)", "y": "query(y}"},
                "model": {"sql": "select * from table"},
            }
        ],
        "column_defs": [
            {
                "trace_name": "Trace Name",
                "columns": [{"header": "X Value", "key": "props.x"}],
            }
        ],
    }
    table = Table(**data)
    assert table.column_defs[0].trace_name == "Trace Name"
    assert table.column_defs[0].columns[0].header == "X Value"


def test_Table_ref_string():
    data = {
        "name": "development",
        "traces": ["ref(trace)"],
    }
    table = Table(**data)
    assert table.traces[0] == "ref(trace)"

    data = {
        "name": "development",
        "traces": ["ref(invalid"],
    }
    with pytest.raises(ValidationError) as exc_info:
        Table(**data)

    error = exc_info.value.errors()[0]
    assert error["msg"] == f"String should match pattern '{REF_REGEX}'"
    assert error["type"] == "string_pattern_mismatch"


def test_Table_column_def_not_present():
    data = {
        "name": "development",
        "traces": [
            {
                "name": "Trace Name",
                "props": {"type": "scatter", "x": "?{x)", "y": "query(y}"},
                "model": {"sql": "select * from table"},
            }
        ],
        "column_defs": [
            {
                "trace_name": "N/A",
                "columns": [{"header": "X Value", "key": "props.x"}],
            }
        ],
    }

    with pytest.raises(ValidationError) as exc_info:
        Table(**data)

    error = exc_info.value.errors()[0]
    assert (
        error["msg"]
        == f"Value error, Column def trace name 'N/A' is not present in trace list on table."
    )
    assert error["type"] == "value_error"


def test_Table_trace_ref_column_def_not_present():
    data = {
        "name": "development",
        "traces": ["ref(trace)"],
        "column_defs": [
            {
                "trace_name": "N/A",
                "columns": [{"header": "X Value", "key": "props.x"}],
            }
        ],
    }

    with pytest.raises(ValidationError) as exc_info:
        Table(**data)

    error = exc_info.value.errors()[0]
    assert (
        error["msg"]
        == f"Value error, Column def trace name 'N/A' is not present in trace list on table."
    )
    assert error["type"] == "value_error"


def test_Table_with_selector():
    data = {"name": "development", "traces": [], "selector": "ref(Other Selector)"}
    table = Table(**data)
    assert table.selector == "ref(Other Selector)"

    data = {"name": "development", "traces": [], "selector": {"name": "Selector"}}
    table = Table(**data)
    assert table.selector.name == "Selector"
