"""Tests for the friendlier Pydantic validators on Insight and Chart layout.

These validators hand-curate the most common new-user mistakes with clear,
actionable messages instead of Pydantic's default ``Extra inputs are not
permitted`` / ``Validation error for layout`` errors.

See visivo/models/insight.py and visivo/models/props/layout.py.
"""

import pytest
from pydantic import ValidationError

from visivo.models.chart import Chart
from visivo.models.insight import Insight


def _msgs(exc_info) -> str:
    """Concatenate all error messages from a ValidationError for substring asserts."""
    return "\n".join(err["msg"] for err in exc_info.value.errors())


# ---------------------------------------------------------------------------
# Insight: top-level fields that belong inside ``props`` (or aren't fields at all)
# ---------------------------------------------------------------------------


def test_insight_with_top_level_model_raises_friendly_error():
    with pytest.raises(ValidationError) as exc_info:
        Insight(
            name="bad",
            model="${ref(orders)}",
            props={"type": "bar", "x": "?{ x }"},
        )

    text = _msgs(exc_info)
    assert "`model` is not a field on Insight" in text
    assert "Reference your model from inside `props`" in text
    assert "https://docs.visivo.io/" in text


def test_insight_with_top_level_type_raises_friendly_error():
    with pytest.raises(ValidationError) as exc_info:
        Insight(
            name="bad",
            type="bar",
            props={"type": "bar", "x": "?{ x }"},
        )

    text = _msgs(exc_info)
    assert "`type` belongs inside `props`" in text
    assert "props.type: bar" in text


def test_insight_with_top_level_x_raises_friendly_error():
    with pytest.raises(ValidationError) as exc_info:
        Insight(
            name="bad",
            x="?{ amount }",
            props={"type": "bar"},
        )

    text = _msgs(exc_info)
    assert "`x` belongs inside `props`" in text


def test_insight_with_top_level_filters_raises_friendly_error():
    with pytest.raises(ValidationError) as exc_info:
        Insight(
            name="bad",
            filters=["?{ x > 0 }"],
            props={"type": "bar", "x": "?{ x }"},
        )

    text = _msgs(exc_info)
    assert "`filters`" in text
    assert "`interactions`" in text
    assert "filter" in text


def test_insight_with_legacy_cohort_on_raises_friendly_error():
    with pytest.raises(ValidationError) as exc_info:
        Insight(
            name="bad",
            cohort_on="?{ region }",
            props={"type": "bar", "x": "?{ x }"},
        )

    text = _msgs(exc_info)
    assert "`cohort_on`" in text
    assert "`split`" in text


def test_insight_missing_props_type_raises_friendly_error():
    with pytest.raises(ValidationError) as exc_info:
        Insight(
            name="bad",
            props={"x": "?{ x }"},
        )

    text = _msgs(exc_info)
    assert "`props.type` is required" in text
    assert "Available chart types" in text
    # Spot-check a couple of common types appear in the hint.
    assert "bar" in text
    assert "scatter" in text


def test_insight_with_valid_props_passes():
    """Sanity: a correct Insight should still construct without raising."""
    insight = Insight(name="good", props={"type": "bar", "x": "?{ x }"})
    assert insight.name == "good"
    assert insight.props.type.value == "bar"


# ---------------------------------------------------------------------------
# Chart layout: title-as-string is the most common new-user mistake
# ---------------------------------------------------------------------------


def test_chart_with_string_layout_title_raises_friendly_error():
    with pytest.raises(ValidationError) as exc_info:
        Chart(name="bad", layout={"title": "Plays by Month"})

    text = _msgs(exc_info)
    assert "`layout.title` must be an object" in text
    assert '{text: "Plays by Month"}' in text


def test_chart_with_string_xaxis_title_raises_friendly_error():
    with pytest.raises(ValidationError) as exc_info:
        Chart(
            name="bad",
            layout={
                "title": {"text": "Chart"},
                "xaxis": {"title": "Date"},
            },
        )

    text = _msgs(exc_info)
    assert "`layout.xaxis.title` must be an object" in text


def test_chart_with_object_title_passes():
    """Sanity: the documented form should still validate."""
    chart = Chart(name="good", layout={"title": {"text": "Hello"}})
    assert chart.layout.title["text"] == "Hello"
