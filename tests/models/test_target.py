from visivo.models.targets.target import Target, TypeEnum
from pydantic import ValidationError
from tests.factories.model_factories import TargetFactory
import pytest
import click


def test_Target_simple_data():
    data = {"name": "development", "database": "database"}
    target = Target(**data)
    assert target.name == "development"


def test_Target_missing_data():
    with pytest.raises(ValidationError) as exc_info:
        Target()

    error = exc_info.value.errors()[0]

    assert error["msg"] == "Field required"
    assert error["type"] == "missing"


def test_Target_bad_connection():
    data = {
        "name": "development",
        "database": "database",
        "port": 5434,
        "type": TypeEnum.postgresql,
    }
    target = Target(**data)
    with pytest.raises(click.ClickException) as exc_info:
        target.read_sql("query")

    assert (
        exc_info.value.message
        == "Error connecting to target 'development'. Ensure the database is running and the connection properties are correct."
    )


def test_Target_password_json():
    target = TargetFactory(password="password")

    assert "**********" in target.model_dump_json()
