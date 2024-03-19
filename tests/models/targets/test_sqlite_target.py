from visivo.models.targets.sqlite_target import SqliteTarget
from pydantic import ValidationError
from tests.factories.model_factories import TargetFactory
import pytest


def test_SqliteTarget_simple_data():
    data = {"name": "target", "database": "database", "type": "sqlite"}
    target = SqliteTarget(**data)
    assert target.name == "target"


def test_Target_missing_data():
    with pytest.raises(ValidationError) as exc_info:
        SqliteTarget()

    error = exc_info.value.errors()[0]

    assert error["msg"] == "Field required"
    assert error["type"] == "missing"


def test_Target_password_json():
    target = TargetFactory(password="password")

    assert "**********" in target.model_dump_json()
