from visivo.models.sources.postgresql_source import PostgresqlSource
import click
import pytest


def test_PostgresqlSource_simple_data():
    data = {"name": "source", "database": "database", "type": "postgresql"}
    source = PostgresqlSource(**data)
    assert source.name == "source"


def test_PostgresqlSource_bad_connection():
    data = {
        "name": "development",
        "database": "database",
        "type": "postgresql",
        "port": 5434,
    }
    source = PostgresqlSource(**data)
    with pytest.raises(click.ClickException) as exc_info:
        source.read_sql("query")

    assert (
        exc_info.value.message
        == "Error connecting to source 'development'. Ensure the database is running and the connection properties are correct."
    )
