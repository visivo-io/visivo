from visivo.models.targets.postgresql_target import PostgresqlTarget
import click
import pytest


def test_PostgresqlTarget_simple_data():
    data = {"name": "target", "database": "database", "type": "postgresql"}
    target = PostgresqlTarget(**data)
    assert target.name == "target"


def test_PostgresqlTarget_bad_connection():
    data = {
        "name": "development",
        "database": "database",
        "port": 5434,
    }
    target = PostgresqlTarget(**data)
    with pytest.raises(click.ClickException) as exc_info:
        target.read_sql("query")

    assert (
        exc_info.value.message
        == "Error connecting to target 'development'. Ensure the database is running and the connection properties are correct."
    )
