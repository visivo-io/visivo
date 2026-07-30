from visivo.models.color_palette import ColorPalette
from tests.factories.model_factories import ChartFactory
from pydantic import ValidationError
import pytest


def test_chart_no_default_colorway():
    chart = ChartFactory(layout={"title": {"text": "Test Chart"}})
    dumped = chart.layout.model_dump(exclude_none=True)
    assert "colorway" not in dumped


def test_chart_axis_automargin_boolean():
    # Regression: layout.schema.json's xaxis/yaxis `automargin` had a malformed
    # boolean branch `{"type": "string", "enum": [true, false]}` — the stray
    # `type: string` made a JSON boolean fail `validate_against_schema` with
    # "Value does not match any of the following schemas", though Plotly accepts
    # a bool. With the `type: string` removed, `automargin: true`/`false`
    # validates. Reverting the schema fix makes this raise ValidationError.
    chart = ChartFactory(layout={"yaxis": {"automargin": True}, "xaxis": {"automargin": False}})
    dumped = chart.layout.model_dump(exclude_none=True)
    assert dumped["yaxis"]["automargin"] is True
    assert dumped["xaxis"]["automargin"] is False


def test_chart_axis_automargin_flaglist_still_valid():
    # The sibling flaglist branch (a string like "height+width") must keep
    # working — the fix only touched the boolean branch.
    chart = ChartFactory(layout={"yaxis": {"automargin": "height+width"}})
    assert chart.layout.model_dump(exclude_none=True)["yaxis"]["automargin"] == "height+width"


def test_chart_predefined_colorway():
    chart = ChartFactory(layout={"title": {"text": "Test Chart"}, "colorway": "High Contrast"})
    assert chart.layout.colorway == ColorPalette.PREDEFINED_PALETTES["High Contrast"]


def test_chart_custom_colorway_list():
    custom_colors = ["#000000", "#FFFFFF", "#FF0000"]
    chart = ChartFactory(layout={"title": {"text": "Test Chart"}, "colorway": custom_colors})
    assert chart.layout.colorway == custom_colors


def test_chart_invalid_colorway_name():
    with pytest.raises(ValidationError) as exc_info:
        ChartFactory(layout={"title": {"text": "Test Chart"}, "colorway": "NonExistentPalette"})
    error = exc_info.value.errors()[0]
    assert "Invalid palette name" in error["msg"]
    assert "Choose from:" in error["msg"]


def test_chart_invalid_colorway_type():
    with pytest.raises(ValidationError) as exc_info:
        ChartFactory(
            layout={
                "title": {"text": "Test Chart"},
                "colorway": 123,  # Integer instead of string or list
            }
        )
    error = exc_info.value.errors()[0]
    assert "colorway must be either a palette name or list of colors" in str(exc_info.value)


def test_chart_invalid_color_list_type():
    with pytest.raises(ValidationError) as exc_info:
        ChartFactory(
            layout={
                "title": {"text": "Test Chart"},
                "colorway": [1, 2, 3],  # Numbers instead of strings
            }
        )
    error = exc_info.value.errors()[0]
    assert "All colors must be strings" in str(exc_info.value)
