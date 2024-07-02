from visivo.models.test import Test
from pydantic import ValidationError
import pytest


def test_Test_missing_data():
    try:
        Test()
    except ValidationError as e:
        error = e.errors()[0]
        assert error["msg"] == "Field required"
        assert error["type"] == "missing"
