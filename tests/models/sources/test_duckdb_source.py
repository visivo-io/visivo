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


def test_DuckdbSource_memory_database_ignores_read_only():
    """DuckDB rejects read_only=True on ':memory:' outright ("Cannot launch
    in-memory database in read-only mode!"), but every schema/query path
    defaults to read_only=True — so a ':memory:' primary (the shape used to
    host an `attach:`ed source) could never connect at all."""
    source = DuckdbSource(name="source", database=":memory:", type="duckdb")

    connection = source.get_connection(read_only=True)
    try:
        # An in-memory database has nothing on disk for "read-only" to
        # protect — prove the connection is actually writable.
        connection.execute("CREATE TABLE t (x INTEGER)")
    finally:
        connection.close()
