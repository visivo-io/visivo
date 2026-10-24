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
        "Error connecting to source 'development'. Ensure the database is running and the connection properties are correct."
        in exc_info.value.message
    )


def test_PostgresqlSource_port_from_env_var(monkeypatch):
    monkeypatch.setenv("PG_PORT", "5433")
    source = PostgresqlSource(
        name="s", type="postgresql", database="d", host="h", port="${env.PG_PORT}"
    )
    assert source.get_port() == 5433
    assert source.url().port == 5433


def test_PostgresqlSource_port_literals():
    assert PostgresqlSource(name="s", type="postgresql", database="d", port=5434).get_port() == 5434
    assert (
        PostgresqlSource(name="s", type="postgresql", database="d", port="5435").get_port() == 5435
    )
    assert PostgresqlSource(name="s", type="postgresql", database="d").get_port() is None


def test_PostgresqlSource_port_env_var_not_numeric(monkeypatch):
    monkeypatch.setenv("PG_PORT", "abc")
    source = PostgresqlSource(name="s", type="postgresql", database="d", port="${env.PG_PORT}")
    with pytest.raises(ValueError, match="not an integer"):
        source.get_port()


def test_PostgresqlSource_port_rejects_non_numeric_literal():
    with pytest.raises(Exception):
        PostgresqlSource(name="s", type="postgresql", database="d", port="abc")


def test_IntOrEnvVarDiscriminator():
    from visivo.models.base.base_model import IntOrEnvVarDiscriminator
    from visivo.models.base.env_var_string import EnvVarString

    discriminator = IntOrEnvVarDiscriminator()
    assert discriminator.__name__() == "IntOrEnvVarDiscriminator"
    assert discriminator(EnvVarString("${env.PG_PORT}")) == "EnvVar"
    assert discriminator("${env.PG_PORT}") == "EnvVar"
    assert discriminator(5432) == "Int"
    assert discriminator("5432") == "Int"
