from visivo.models.table import Table
from visivo.models.base.base_model import REF_REGEX
from pydantic import ValidationError
import pytest


def test_Table_simple_data():
    data = {"name": "development", "columns": []}
    table = Table(**data)
    assert table.name == "development"


def test_Table_with_trace_simple_data():
    data = {
        "name": "development",
        "columns": [],
        "traces": [
            {
                "name": "Trace Name",
                "props": {"type": "scatter", "x": "query(x)", "y": "query(y)"},
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
                "props": {"type": "scatter", "x": "query(x)", "y": "query(y)"},
                "model": {"sql": "select * from table"},
            }
        ],
        "columns": [
            {
                "cohort_name": "Trace Name",
                "column_defs": [{"header": "X Value", "key": "props.x"}],
            }
        ],
    }
    table = Table(**data)
    assert table.columns[0].cohort_name == "Trace Name"
    assert table.columns[0].column_defs[0].header == "X Value"


def test_Table_ref_string():
    table = Table(traces=["ref(trace)"], columns=[])
    assert table.traces[0] == "ref(trace)"

    with pytest.raises(ValidationError) as exc_info:
        Table(traces=["ref(trace"])

    error = exc_info.value.errors()[0]
    assert error["msg"] == f"String should match pattern '{REF_REGEX}'"
    assert error["type"] == "string_pattern_mismatch"
