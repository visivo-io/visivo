from visivo.models.row import HeightEnum, Row
from pydantic import ValidationError
import pytest


def _row_with_height(value):
    return Row(name="r1", height=value, items=[])


def test_row_default_height_is_enum_medium():
    row = Row(name="r1", items=[])
    assert row.height == HeightEnum.medium


@pytest.mark.parametrize(
    "token",
    ["compact", "xsmall", "small", "medium", "large", "xlarge", "xxlarge"],
)
def test_row_height_enum_token_parses(token):
    row = _row_with_height(token)
    assert row.height == HeightEnum(token)


@pytest.mark.parametrize("pixels", [1, 64, 128, 320, 1024, 1600])
def test_row_height_integer_value_parses(pixels):
    row = _row_with_height(pixels)
    assert row.height == pixels


@pytest.mark.parametrize("bad", [0, -1, -200])
def test_row_height_non_positive_int_raises(bad):
    with pytest.raises(ValidationError) as exc_info:
        _row_with_height(bad)
    assert any(
        "positive integer" in str(err.get("msg", ""))
        or "positive integer" in str(err.get("ctx", {}).get("error", ""))
        for err in exc_info.value.errors()
    )


def test_row_height_string_token_dumps_as_string():
    row = _row_with_height("large")
    dumped = row.model_dump()
    assert dumped["height"] == HeightEnum.large


def test_row_height_integer_dumps_as_integer():
    row = _row_with_height(320)
    dumped = row.model_dump()
    assert dumped["height"] == 320
