from visivo.models.sources.duckdb_source import DuckdbSource
import pytest
from pydantic import ValidationError


def test_DuckdbSource_simple_data():
    data = {"name": "source", "database": "database", "type": "duckdb"}
    source = DuckdbSource(**data)
    assert source.name == "source"


def test_DuckdbSource_missing_data():
    with pytest.raises(ValidationError) as exc_info:
        DuckdbSource()

    error = exc_info.value.errors()[0]

    assert error["msg"] == "Field required"
    assert error["type"] == "missing"
