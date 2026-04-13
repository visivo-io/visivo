from visivo.models.chart import Chart
from visivo.models.base.base_model import REF_PROPERTY_PATTERN
from pydantic import ValidationError
import pytest


def test_Chart_simple_data():
    data = {"name": "development"}
    chart = Chart(**data)
    assert chart.name == "development"


def test_Chart_with_insight_simple_data():
    data = {
        "name": "development",
        "insights": [
            {
                "name": "insight-name",
                "props": {"type": "scatter", "x": "?{x}", "y": "?{y}"},
            }
        ],
    }
    chart = Chart(**data)
    assert chart.name == "development"


def test_Chart_ref_string():
    data = {
        "name": "development",
        "insights": ["ref(insight)"],
    }
    chart = Chart(**data)
    assert chart.insights[0] == "ref(insight)"

    data = {
        "name": "development",
        "insights": ["ref(invalid"],
    }

    with pytest.raises(ValidationError) as exc_info:
        Chart(**data)

    error = exc_info.value.errors()[0]
    assert error["msg"] == f"String should match pattern '{REF_PROPERTY_PATTERN}'"
    assert error["type"] == "string_pattern_mismatch"
