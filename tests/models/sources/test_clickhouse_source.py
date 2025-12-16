import pytest
import click
from visivo.models.sources.clickhouse_source import ClickhouseSource


def test_ClickhouseSource_simple_data():
    data = {"name": "source", "database": "default", "type": "clickhouse"}
    source = ClickhouseSource(**data)
    assert source.name == "source"
    assert source.port == 9000  # Default native TCP port
    assert source.protocol == "native"
    assert source.secure is False


def test_ClickhouseSource_http_protocol():
    data = {
        "name": "http_source",
        "database": "default",
        "type": "clickhouse",
        "port": 8123,
        "protocol": "http",
    }
    source = ClickhouseSource(**data)
    assert source.protocol == "http"
    assert source.port == 8123
    assert source.get_connection_dialect() == "clickhouse+http"


def test_ClickhouseSource_native_protocol():
    data = {
        "name": "native_source",
        "database": "default",
        "type": "clickhouse",
    }
    source = ClickhouseSource(**data)
    assert source.protocol == "native"
    assert source.get_connection_dialect() == "clickhouse+native"


def test_ClickhouseSource_cloud_config():
    data = {
        "name": "cloud_source",
        "database": "default",
        "type": "clickhouse",
        "host": "example.clickhouse.cloud",
        "port": 8443,
        "protocol": "http",
        "secure": True,
    }
    source = ClickhouseSource(**data)
    assert source.secure is True
    assert source.port == 8443
    assert source.protocol == "http"
    assert source.connect_args() == {"secure": True}


def test_ClickhouseSource_get_dialect():
    data = {"name": "source", "database": "default", "type": "clickhouse"}
    source = ClickhouseSource(**data)
    assert source.get_dialect() == "clickhouse"


def test_ClickhouseSource_bad_connection():
    data = {
        "name": "development",
        "database": "default",
        "type": "clickhouse",
        "host": "localhost",
        "port": 9000,
    }
    source = ClickhouseSource(**data)
    with pytest.raises(click.ClickException) as exc_info:
        source.read_sql("SELECT 1")

    assert (
        "Error connecting to source 'development'. Ensure the database is running and the connection properties are correct."
        in exc_info.value.message
    )
