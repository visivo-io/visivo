from visivo.models.trace_props.fields import TracePropsFieldUnion
from visivo.models.trace import Trace
from pydantic import ValidationError
import pytest


def test_invalid_trace_prop_mesh3d():
    data = {
        "name": "development",
        "props": {
            "type": "mesh3d",
            "x": {},  # x attribute expecting str or list (will coerce int to str)
            "visible": "true",
        },
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }

    with pytest.raises(Exception) as e:
        Trace(**data)
    message = str(e.value)
    errors = e._excinfo[1].errors()
    assert e.type == ValidationError
    assert "1 validation error" in message
    assert errors[0]["type"] == "union_tag_not_found"


def test_float_property_validation():
    data = {
        "name": "development",
        "props": {
            "type": "bar",
            "textfont": {"size": 15},
        },
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }

    trace = Trace(**data)


def test_valid_trace_prop_mesh3d():
    data = {
        "name": "development",
        "props": {"type": "mesh3d", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_barpolar():
    data = {
        "name": "development",
        "props": {"type": "barpolar", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_scattersmith():
    data = {
        "name": "development",
        "props": {"type": "scattersmith", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_streamtube():
    data = {
        "name": "development",
        "props": {"type": "streamtube", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_cone():
    data = {
        "name": "development",
        "props": {"type": "cone", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_scattermapbox():
    data = {
        "name": "development",
        "props": {"type": "scattermapbox", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_scattergeo():
    data = {
        "name": "development",
        "props": {"type": "scattergeo", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_scatterpolar():
    data = {
        "name": "development",
        "props": {"type": "scatterpolar", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_sunburst():
    data = {
        "name": "development",
        "props": {"type": "sunburst", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_isosurface():
    data = {
        "name": "development",
        "props": {
            "type": "isosurface",
            "uirevision": 1,
            "visible": "true",
            "slices": {
                "z": {
                    "show": True,
                    "locations": [-0.1],
                }
            },
        },
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    # breakpoint()
    props = trace.props
    assert props.model_dump()["slices"]["z"]["locations"] == [-0.1]
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_violin():
    data = {
        "name": "development",
        "props": {"type": "violin", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_scatter():
    data = {
        "name": "development",
        "props": {"type": "scatter", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_image():
    data = {
        "name": "development",
        "props": {"type": "image", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_volume():
    data = {
        "name": "development",
        "props": {"type": "volume", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_indicator():
    data = {
        "name": "development",
        "props": {"type": "indicator", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_funnelarea():
    data = {
        "name": "development",
        "props": {"type": "funnelarea", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_icicle():
    data = {
        "name": "development",
        "props": {"type": "icicle", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_scatterternary():
    data = {
        "name": "development",
        "props": {"type": "scatterternary", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_sankey():
    data = {
        "name": "development",
        "props": {"type": "sankey", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_parcats():
    data = {
        "name": "development",
        "props": {"type": "parcats", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_scattercarpet():
    data = {
        "name": "development",
        "props": {"type": "scattercarpet", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_treemap():
    data = {
        "name": "development",
        "props": {"type": "treemap", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_contourcarpet():
    data = {
        "name": "development",
        "props": {"type": "contourcarpet", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_candlestick():
    data = {
        "name": "development",
        "props": {"type": "candlestick", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_pie():
    data = {
        "name": "development",
        "props": {"type": "pie", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_scatterpolargl():
    data = {
        "name": "development",
        "props": {"type": "scatterpolargl", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_scatter3d():
    data = {
        "name": "development",
        "props": {"type": "scatter3d", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_bar():
    data = {
        "name": "development",
        "props": {"type": "bar", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_box():
    data = {
        "name": "development",
        "props": {"type": "box", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_histogram2d():
    data = {
        "name": "development",
        "props": {"type": "histogram2d", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_histogram():
    data = {
        "name": "development",
        "props": {"type": "histogram", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_ohlc():
    data = {
        "name": "development",
        "props": {"type": "ohlc", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_heatmapgl():
    data = {
        "name": "development",
        "props": {"type": "heatmapgl", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_surface():
    data = {
        "name": "development",
        "props": {"type": "surface", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_choroplethmapbox():
    data = {
        "name": "development",
        "props": {"type": "choroplethmapbox", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_parcoords():
    data = {
        "name": "development",
        "props": {"type": "parcoords", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_scattergl():
    data = {
        "name": "development",
        "props": {"type": "scattergl", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_choropleth():
    data = {
        "name": "development",
        "props": {"type": "choropleth", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_densitymapbox():
    data = {
        "name": "development",
        "props": {"type": "densitymapbox", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_heatmap():
    data = {
        "name": "development",
        "props": {"type": "heatmap", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_carpet():
    data = {
        "name": "development",
        "props": {"type": "carpet", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_contour():
    data = {
        "name": "development",
        "props": {"type": "contour", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_funnel():
    data = {
        "name": "development",
        "props": {"type": "funnel", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_histogram2dcontour():
    data = {
        "name": "development",
        "props": {"type": "histogram2dcontour", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_waterfall():
    data = {
        "name": "development",
        "props": {"type": "waterfall", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)


def test_valid_trace_prop_splom():
    data = {
        "name": "development",
        "props": {"type": "splom", "uirevision": 1, "visible": "true"},
        "model": {"name": "awesome-model", "sql": "select * from table"},
    }
    trace = Trace(**data)
    props = trace.props
    assert isinstance(props, TracePropsFieldUnion)
