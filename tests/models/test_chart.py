from visivo.models.chart import Chart
from ..factories.model_factories import TraceFactory
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
                "props": {"type": "scatter", "x": "query(x)", "y": "query(y)"},
                "model": {"sql": "select * from table"},
            }
        ],
    }
    chart = Chart(**data)
    assert chart.name == "development"


def test_Chart_missing_data():
    try:
        Chart()
    except ValidationError as e:
        error = e.errors()[0]
        assert error["msg"] == "Field required"
        assert error["type"] == "missing"


def test_Chart_ref_string():
    chart = Chart(traces=["ref(trace)"])
    assert chart.traces[0] == "ref(trace)"

    with pytest.raises(ValidationError) as exc_info:
        Chart(traces=["ref(trace"])

    error = exc_info.value.errors()[0]
    assert error["msg"] == f"String should match pattern '{REF_REGEX}'"
    assert error["type"] == "string_pattern_mismatch"
