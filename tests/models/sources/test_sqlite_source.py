from visivo.models.sources.sqlite_source import SqliteSource
from pydantic import ValidationError
from tests.factories.model_factories import SourceFactory
import pytest


def test_SqliteSource_simple_data():
    data = {"name": "source", "database": "database", "type": "sqlite"}
    source = SqliteSource(**data)
    assert source.name == "source"


def test_Source_missing_data():
    with pytest.raises(ValidationError) as exc_info:
        SqliteSource()

    error = exc_info.value.errors()[0]

    assert error["msg"] == "Field required"
    assert error["type"] == "missing"


def test_Source_password_json():
    source = SourceFactory(password="password")

    assert "**********" in source.model_dump_json()
