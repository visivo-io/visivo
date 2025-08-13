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
    assert error["msg"] == "Field required"
    assert error["type"] == "missing"


def test_Trace_unknown_props_type():
    data = {
        "name": "development",
        "props": {"type": "unknown", "x": "?{x}", "y": "?{y}"},
        "model": {"sql": "select * from table"},
    }
    with pytest.raises(ValidationError) as exc_info:
        Trace(**data)

    error = exc_info.value.errors()[0]
    assert (
        error["msg"]
        == "Input should be 'bar', 'barpolar', 'box', 'candlestick', 'carpet', 'choropleth', 'choroplethmap', 'choroplethmapbox', 'cone', 'contour', 'contourcarpet', 'densitymap', 'densitymapbox', 'funnel', 'funnelarea', 'heatmap', 'histogram', 'histogram2d', 'histogram2dcontour', 'icicle', 'image', 'indicator', 'isosurface', 'mesh3d', 'ohlc', 'parcats', 'parcoords', 'pie', 'sankey', 'scatter', 'scatter3d', 'scattercarpet', 'scattergeo', 'scattergl', 'scattermap', 'scattermapbox', 'scatterpolar', 'scatterpolargl', 'scattersmith', 'scatterternary', 'splom', 'streamtube', 'sunburst', 'surface', 'treemap', 'violin', 'volume' or 'waterfall'"
    )
    assert error["type"] == "enum"


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
    assert error["msg"] == "Value error, referenced column name 'y' is not in columns definition"
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
            "x": "column(x_data)",
            "y": "?{ y }",
            "x0": "column(x_data)[0]",
        },
        "model": {"sql": "select * from table"},
    }
    trace = Trace(**data)
    assert trace.name == "development"
    assert isinstance(trace.columns.x_data, QueryString)


def test_Trace_with_query_string_columns_serialization():
    """Test that traces with QueryString columns can be serialized to JSON"""
    data = {
        "name": "test-trace-with-query-columns",
        "columns": {
            "x_data": "?{x}",
            "y_data": "?{y}",
            "color": "?{ case when x >= 5 then '#713B57' else 'grey' end }",
        },
        "props": {
            "type": "scatter",
            "x": "column(x_data)",
            "y": "column(y_data)",
            "marker": {"color": "column(color)"},
        },
        "model": {"sql": "select * from table"},
    }
    trace = Trace(**data)

    # Test that model_dump works
    dumped = trace.model_dump()
    assert dumped["columns"]["x_data"] == "?{x}"
    assert dumped["columns"]["y_data"] == "?{y}"
    assert dumped["columns"]["color"] == "?{ case when x >= 5 then '#713B57' else 'grey' end }"

    # Test that model_dump_json works without raising errors
    json_str = trace.model_dump_json()
    assert "?{x}" in json_str
    assert "?{y}" in json_str
    assert "#713B57" in json_str

    # Test that the trace can be reconstructed from the dumped data
    trace_from_dump = Trace(**dumped)
    assert trace_from_dump.name == "test-trace-with-query-columns"
    assert isinstance(trace_from_dump.columns.x_data, QueryString)
