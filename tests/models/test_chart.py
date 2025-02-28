from visivo.models.chart import Chart
from visivo.models.base.base_model import REF_REGEX
from pydantic import ValidationError
import pytest


def test_Chart_simple_data():
    data = {"name": "development"}
    chart = Chart(**data)
    assert chart.name == "development"


def test_Chart_with_trace_simple_data():
    data = {
        "name": "development",
        "traces": [
            {
                "name": "Trace Name",
                "props": {"type": "scatter", "x": "?{x}", "y": "?{y}"},
                "model": {"sql": "select * from table"},
            }
        ],
    }
    chart = Chart(**data)
    assert chart.name == "development"


def test_Chart_ref_string():
    data = {
        "name": "development",
        "traces": ["ref(trace)"],
    }
    chart = Chart(**data)
    assert chart.traces[0] == "ref(trace)"

    data = {
        "name": "development",
        "traces": ["ref(invalid"],
    }

    with pytest.raises(ValidationError) as exc_info:
        Chart(**data)

    error = exc_info.value.errors()[0]
    assert error["msg"] == f"String should match pattern '{REF_REGEX}'"
    assert error["type"] == "string_pattern_mismatch"


def test_Chart_with_selector():
    data = {"name": "development", "traces": [], "selector": "ref(Other Selector)"}
    table = Chart(**data)
    assert table.selector == "ref(Other Selector)"

    data = {"name": "development", "traces": [], "selector": {"name": "Selector"}}
    table = Chart(**data)
    assert table.selector.name == "Selector"
