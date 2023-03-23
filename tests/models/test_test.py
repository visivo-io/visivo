from visivo.models.test import Test
from pydantic import ValidationError
import pytest


def test_Test_missing_data():
    try:
        Test()
    except ValidationError as e:
        error = e.errors()[0]
        assert error["msg"] == "field required"
        assert error["type"] == "value_error.missing"


def test_Test_invalid_type():
    with pytest.raises(ValidationError) as exc_info:
        Test(type="not_real_test_type")

    error = exc_info.value.errors()[0]

    assert (
        "value is not a valid enumeration member; permitted:" in error["msg"]
    )
    assert error["type"] == "type_error.enum"
