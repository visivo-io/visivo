from visivo.models.target import Target
from pydantic import ValidationError
from tests.factories.model_factories import TargetFactory
import pytest


def test_Target_simple_data():
    data = {
        "name": "development",
        "database": "database",
    }
    target = Target(**data)
    assert target.name == "development"


def test_Target_missing_data():
    with pytest.raises(ValidationError) as exc_info:
        Target()

    error = exc_info.value.errors()[0]

    assert error["msg"] == "field required"
    assert error["type"] == "value_error.missing"


def test_Target_password_json():
    target = TargetFactory(password="password")

    assert "**********" in target.json()
