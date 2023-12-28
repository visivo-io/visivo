from visivo.logging.error_formatter import format_validation_error
from pydantic import ValidationError, BaseModel
import pytest


class TestMissing(BaseModel):
    required: str


def test_format_value_error():
    with pytest.raises(ValidationError) as exc_info:
        TestMissing()

    assert "" == format_validation_error(exc_info.value)
