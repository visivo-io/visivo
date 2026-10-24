import click
import psycopg2
import pytest
from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool

from visivo.jobs.run_source_schema_job import action
from visivo.models.sources.postgresql_source import PostgresqlSource
from visivo.server.managers.source_manager import SourceManager

DRIVER_TEXT = (
    'connection to server at "db.internal" (10.0.0.5), port 5439 failed: '
    'FATAL:  password authentication failed for user "analytics"\n'
)
ENV_LINE = (
    "Could not log in to source 'warehouse' as 'analytics': password authentication failed. "
    "Check the password or the environment variable it reads (${env.WAREHOUSE_PASSWORD})."
)


def engine_raising(message):
    def creator():
        raise psycopg2.OperationalError(message)

    return create_engine("postgresql+psycopg2://", creator=creator, poolclass=NullPool)


def warehouse(driver_text=DRIVER_TEXT, **overrides):
    config = {
        "name": "warehouse",
        "type": "postgresql",
        "host": "db.internal",
        "port": 5439,
        "database": "prod",
        "username": "analytics",
        "password": "${env.WAREHOUSE_PASSWORD}",
        **overrides,
    }
    source = PostgresqlSource(**{k: v for k, v in config.items() if v is not None})
    source._engine = engine_raising(driver_text)
    return source


@pytest.fixture(autouse=True)
def wrong_password(monkeypatch):
    monkeypatch.setenv("WAREHOUSE_PASSWORD", "hunter2")


def assert_no_driver_dump(text):
    for leaked in ("psycopg2", "sqlalche.me", "db.internal", "10.0.0.5", "hunter2", "://"):
        assert leaked not in text


def test_read_sql_reports_login_failure_in_one_line_naming_the_env_var():
    with pytest.raises(click.ClickException) as exc:
        warehouse().read_sql("select 1")

    assert exc.value.message == ENV_LINE
    assert_no_driver_dump(exc.value.message)


def test_literal_password_hint_does_not_mention_an_env_var():
    with pytest.raises(click.ClickException) as exc:
        warehouse(password="hunter2").read_sql("select 1")

    assert exc.value.message == (
        "Could not log in to source 'warehouse' as 'analytics': "
        "password authentication failed. Check the password."
    )


def test_message_omits_user_when_none_is_configured():
    with pytest.raises(click.ClickException) as exc:
        warehouse(username=None).read_sql("select 1")

    assert exc.value.message.startswith(
        "Could not log in to source 'warehouse': password authentication failed."
    )


def test_message_omits_user_when_its_env_var_is_unset(monkeypatch):
    monkeypatch.delenv("WAREHOUSE_USER", raising=False)

    with pytest.raises(click.ClickException) as exc:
        warehouse(username="${env.WAREHOUSE_USER}").read_sql("select 1")

    assert exc.value.message.startswith(
        "Could not log in to source 'warehouse': password authentication failed."
    )


def test_other_connection_errors_keep_the_full_driver_error():
    source = warehouse(driver_text='could not translate host name "db.internal"')

    with pytest.raises(click.ClickException) as exc:
        source.read_sql("select 1")

    assert exc.value.message.startswith("Error connecting to source 'warehouse'.")
    assert "could not translate host name" in exc.value.message


def test_get_schema_reports_login_failure_once_and_does_not_print_it(capsys):
    schema = warehouse().get_schema()

    assert schema["metadata"]["error"] == ENV_LINE
    assert schema["metadata"]["errors"] == [ENV_LINE]
    assert "password authentication failed" not in capsys.readouterr().out


def test_schema_job_failure_carries_the_one_line_message(capsys):
    result = action(warehouse())

    assert result.success is False
    assert ENV_LINE in result.message
    assert_no_driver_dump(result.message)
    assert result.diagnostic.message == (
        f"Could not read the schema for source 'warehouse': {ENV_LINE}"
    )
    assert result.diagnostic.detail is None
    assert "password authentication failed" not in capsys.readouterr().out


def test_test_connection_reports_login_failure_in_one_line():
    manager = SourceManager()
    manager.save_from_config(
        {
            "name": "warehouse",
            "type": "postgresql",
            "host": "db.internal",
            "port": 5439,
            "database": "prod",
            "username": "analytics",
            "password": "${env.WAREHOUSE_PASSWORD}",
        }
    )
    manager.get("warehouse")._engine = engine_raising(DRIVER_TEXT)

    result = manager.test_connection("warehouse")

    assert result == {"source": "warehouse", "status": "connection_failed", "error": ENV_LINE}
