from visivo.models.trace import Trace
from tests.factories.model_factories import TraceFactory
from pydantic import ValidationError


def test_Trace_simple_data():
    data = {
        "name": "development",
        "x": "x",
        "y": "y",
        "base_sql": "select * from table",
    }
    trace = Trace(**data)
    assert trace.name == "development"


def test_Trace_Test_generation():
    data = {
        "name": "development",
        "x": "x",
        "y": "y",
        "base_sql": "select * from table",
        "tests": [{"coordinate_exists": {"coordinates": {"x": 2, "y": 1}}}],
    }
    trace = Trace(**data)
    tests = trace.all_tests()
    assert tests[0].name == "development-coordinate_exists-1"
    assert tests[0].kwargs == {"coordinates": {"x": 2, "y": 1}}
    assert tests[0].type == "coordinate_exists"


def test_Trace_missing_data():
    try:
        Trace()
    except ValidationError as e:
        error = e.errors()[0]
        assert error["msg"] == "field required"
        assert error["type"] == "value_error.missing"


def test_Trace_get_trace_name():
    assert Trace.get_name(obj=TraceFactory()) == "trace"
