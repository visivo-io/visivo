from visivo.models.base.context_string import ContextString
from visivo.models.base.query_string import QueryString
from visivo.models.trace import Trace
from tests.factories.model_factories import TraceFactory
from pydantic import ValidationError
import pytest
from visivo.parsers.yaml_ordered_dict import YamlOrderedDict, setup_yaml_ordered_dict


def test_Trace_simple_data():
    data = {
        "name": "development",
        "props": {"type": "scatter", "x": "?{x}", "y": "?{y}"},
        "model": {"sql": "select * from table"},
    }
    trace = Trace(**data)
    assert trace.name == "development"


def test_Trace_missing_props():
    data = {
        "name": "development",
        "model": {"sql": "select * from table"},
    }

    trace = Trace(**data)
    assert trace.name == "development"


def test_Trace_missing_props_type():
    data = {
        "name": "development",
        "props": {"x": "?{x}", "y": "?{y}"},
        "model": {"sql": "select * from table"},
    }
    with pytest.raises(ValidationError) as exc_info:
        Trace(**data)

    error = exc_info.value.errors()[0]
    assert error["msg"] == "Value error, trace_props type is required."
    assert error["type"] == "value_error"


def test_Trace_unknown_props_type():
    data = {
        "name": "development",
        "props": {"type": "unknown", "x": "?{x}", "y": "?{y}"},
        "model": {"sql": "select * from table"},
    }
    with pytest.raises(ValidationError) as exc_info:
        Trace(**data)

    error = exc_info.value.errors()[0]
    assert error["msg"] == "Value error, unknown is not a valid trace_props type."
    assert error["type"] == "value_error"


def test_Trace_get_trace_name():
    assert Trace.get_name(obj=TraceFactory()) == "trace"


def test_Trace_column_root_validation_with_reference_missing():
    data = {
        "name": "development",
        "columns": {"x": "query"},
        "props": {"type": "scatter", "x": "column(y)"},
        "model": {"sql": "select * from table"},
    }

    with pytest.raises(ValidationError) as exc_info:
        Trace(**data)

    error = exc_info.value.errors()[0]
    assert (
        error["msg"]
        == "Value error, referenced column name 'y' is not in columns definition"
    )
    assert error["type"] == "value_error"


def test_Trace_column_root_validation_with_reference():
    data = {
        "name": "development",
        "columns": {"x_data": "x"},
        "props": {
            "type": "indicator",
            "value": "column(x_data)[0]",
            "delta": {"reference": "column(x_data)[1]"},
        },
        "model": {"sql": "select * from table"},
    }
    trace = Trace(**data)
    assert trace.name == "development"


def test_Trace_column_root_validation_with_reference_extra_paren():
    reference = YamlOrderedDict()
    reference["reference"] = "column(x_data)[1]"
    data = {
        "name": "development",
        "columns": {"x_data": "x"},
        "props": {
            "type": "indicator",
            "value": "column(x_data)[0]",
            "delta": reference,
        },
        "model": {"sql": "select * from table"},
    }
    trace = Trace(**data)
    assert trace.name == "development"


def test_Trace_with_columns_without_props():
    data = {
        "name": "development",
        "columns": {"x_data": "x"},
        "model": {"sql": "select * from table"},
    }
    trace = Trace(**data)
    assert trace.name == "development"


def test_Trace_with_columns_and_props_as_query_string_props():
    data = {
        "name": "development",
        "columns": {"x_data": "?{x}"},
        "props": {
            "type": "scatter",
            "x": "${ columns.x_data }",
            "y": "?{ y }",
            "x0": "${ columns.x_data[0] }",
        },
        "model": {"sql": "select * from table"},
    }
    trace = Trace(**data)
    assert trace.name == "development"
    assert isinstance(trace.columns.x_data, QueryString)
    assert isinstance(trace.props.x, ContextString)
    assert isinstance(trace.props.y, QueryString)
    assert isinstance(trace.props.x0, ContextString)
