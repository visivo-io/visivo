from visivo.models.chart import Chart
from ..factories.model_factories import TraceFactory
from visivo.models.base_model import REF_REGEX
from pydantic import ValidationError
import pytest


def test_Chart_simple_data():
    data = {"name": "development"}
    chart = Chart(**data)
    assert chart.name == "development"


def test_Chart_missing_data():
    try:
        Chart()
    except ValidationError as e:
        error = e.errors()[0]
        assert error["msg"] == "field required"
        assert error["type"] == "value_error.missing"


def test_Chart_find_trace():
    project = Chart(data={}, traces=[])
    assert project.find_trace(name="trace") == None

    trace = TraceFactory()
    project = Chart(data={}, traces=[trace])
    assert project.find_trace(name="trace") == trace


def test_Chart_ref_string():
    chart = Chart(traces=["ref(trace)"])
    assert chart.traces[0] == "ref(trace)"

    with pytest.raises(ValidationError) as exc_info:
        Chart(traces=["ref(trace"])

    error = exc_info.value.errors()[0]
    assert error["msg"] == f'string does not match regex "{REF_REGEX}"'
    assert error["type"] == "value_error.str.regex"
