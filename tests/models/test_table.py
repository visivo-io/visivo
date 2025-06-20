from visivo.models.table import Table
from visivo.models.base.base_model import REF_REGEX
from pydantic import ValidationError
import pytest
from visivo.models.models.model import Model
from visivo.models.trace import Trace


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
                "props": {"type": "scatter", "x": "?{x}", "y": "?{y}"},
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
                "props": {"type": "scatter", "x": "?{x}", "y": "?{y}"},
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
                "props": {"type": "scatter", "x": "?{x}", "y": "?{y}"},
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


class DummyModel(Model):
    name: str = "dummy_model"
    sql: str = "select 1 as a, 2 as b"

class DummyTrace(Trace):
    name: str = "dummy_trace"
    model: str = "ref(dummy_model)"
    props: dict = {"type": "bar"}


def test_table_model_only_valid():
    table = Table(name="table1", model=DummyModel(name="m1"))
    assert table.model.name == "m1"
    assert table.traces == []


def test_table_traces_only_valid():
    trace = DummyTrace(name="t1", model="ref(m1)", props={"type": "bar"})
    table = Table(name="table2", traces=[trace])
    assert table.traces[0].name == "t1"
    assert table.model is None


def test_table_model_and_traces_invalid():
    trace = DummyTrace(name="t2", model="ref(m1)", props={"type": "bar"})
    with pytest.raises(ValueError):
        Table(name="table3", model=DummyModel(name="m2"), traces=[trace])


def test_table_model_serialization_with_data():
    # Simulate model job attaching data as direct query result
    table = Table(name="table4", model=DummyModel(name="m3"))
    # Attach data as if by orchestration layer
    table.traces = [{"data": [{"a": 1, "b": 2}, {"a": 3, "b": 4}]}]
    d = table.model_dump()
    assert "traces" in d
    assert d["traces"][0]["data"] == [{"a": 1, "b": 2}, {"a": 3, "b": 4}]


def test_table_traces_serialization():
    trace = DummyTrace(name="t3", model="ref(m1)", props={"type": "bar"})
    table = Table(name="table5", traces=[trace])
    d = table.model_dump()
    assert "traces" in d
    assert d["traces"][0]["name"] == "t3"
