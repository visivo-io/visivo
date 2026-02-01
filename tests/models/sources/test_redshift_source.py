import sys
import types
import pytest
import click
from unittest.mock import patch, MagicMock
from visivo.models.sources.redshift_source import RedshiftSource


def test_redshift_source_simple_data():
    """Test basic Redshift source creation."""
    data = {"name": "source", "database": "database", "type": "redshift"}
    source = RedshiftSource(**data)
    assert source.name == "source"
    assert source.database == "database"
    assert source.type == "redshift"


def test_redshift_source_with_host_and_port():
    """Test Redshift source with host and port configuration."""
    data = {
        "name": "redshift_source",
        "database": "dev",
        "type": "redshift",
        "host": "my-cluster.abcdefghij.us-east-1.redshift.amazonaws.com",
        "port": 5439,
        "username": "testuser",
        "password": "testpass",
    }
    source = RedshiftSource(**data)
    assert source.name == "redshift_source"
    assert source.database == "dev"
    assert source.host == "my-cluster.abcdefghij.us-east-1.redshift.amazonaws.com"
    assert source.port == 5439
    assert source.username == "testuser"


def test_redshift_source_iam_authentication():
    """Test Redshift source with IAM authentication."""
    data = {
        "name": "redshift_iam",
        "database": "dev",
        "type": "redshift",
        "host": "my-cluster.abcdefghij.us-east-1.redshift.amazonaws.com",
        "port": 5439,
        "username": "testuser",
        "cluster_identifier": "my-cluster",
        "region": "us-east-1",
        "iam": True,
    }
    source = RedshiftSource(**data)
    assert source.cluster_identifier == "my-cluster"
    assert source.region == "us-east-1"
    assert source.iam is True

    # Check IAM settings are configured
    assert source.cluster_identifier == "my-cluster"
    assert source.region == "us-east-1"
    assert source.iam is True


def test_redshift_source_ssl_enabled():
    """Test Redshift source with SSL enabled (default)."""
    data = {"name": "redshift_ssl", "database": "dev", "type": "redshift"}
    source = RedshiftSource(**data)
    assert source.ssl is True


def test_redshift_source_ssl_disabled():
    """Test Redshift source with SSL disabled."""
    data = {"name": "redshift_no_ssl", "database": "dev", "type": "redshift", "ssl": False}
    source = RedshiftSource(**data)
    assert source.ssl is False


def test_redshift_source_type():
    """Test that Redshift source has correct type."""
    data = {"name": "source", "database": "database", "type": "redshift"}
    source = RedshiftSource(**data)
    assert source.type == "redshift"


def test_redshift_source_connection_params():
    """Test connection parameters for Redshift."""
    data = {
        "name": "redshift_conn_test",
        "database": "dev",
        "type": "redshift",
        "host": "my-cluster.abcdefghij.us-east-1.redshift.amazonaws.com",
        "port": 5439,
        "username": "testuser",
        "password": "testpass",
    }
    source = RedshiftSource(**data)

    # Just verify the source has the expected attributes
    assert source.host == "my-cluster.abcdefghij.us-east-1.redshift.amazonaws.com"
    assert source.port == 5439
    assert source.username == "testuser"
    assert source.database == "dev"


def test_redshift_source_iam_params():
    """Test IAM parameters for Redshift."""
    data = {
        "name": "redshift_iam_params",
        "database": "dev",
        "type": "redshift",
        "host": "my-cluster.abcdefghij.us-east-1.redshift.amazonaws.com",
        "port": 5439,
        "username": "testuser",
        "iam": True,
        "cluster_identifier": "my-cluster",
        "region": "us-east-1",
    }
    source = RedshiftSource(**data)

    # Verify IAM configuration
    assert source.iam is True
    assert source.cluster_identifier == "my-cluster"
    assert source.region == "us-east-1"
    assert source.username == "testuser"


def test_redshift_source_connection_pool_size():
    """Test connection pool size configuration."""
    data = {
        "name": "redshift_pool",
        "database": "dev",
        "type": "redshift",
        "connection_pool_size": 5,
    }
    source = RedshiftSource(**data)
    assert source.connection_pool_size == 5


def test_redshift_source_bad_connection():
    """Test Redshift source with bad connection parameters."""
    data = {
        "name": "bad_redshift",
        "database": "nonexistent",
        "type": "redshift",
        "host": "nonexistent.redshift.amazonaws.com",
        "port": 5439,
        "username": "baduser",
        "password": "badpass",
    }
    source = RedshiftSource(**data)

    # Since redshift-connector will attempt actual connection, expect ImportError or connection error
    with pytest.raises((ImportError, Exception)):
        source.read_sql("SELECT 1")


def test_redshift_source_schema_setting():
    """Test Redshift source with schema configuration."""
    data = {"name": "redshift_schema", "database": "dev", "type": "redshift", "db_schema": "public"}
    source = RedshiftSource(**data)
    assert source.db_schema == "public"


def test_redshift_source_defaults():
    """Test Redshift source default values."""
    data = {"name": "redshift_defaults", "database": "dev", "type": "redshift"}
    source = RedshiftSource(**data)

    # Test default values
    assert source.iam is False
    assert source.ssl is True
    assert source.connection_pool_size == 1
    assert source.cluster_identifier is None
    assert source.region is None


def test_redshift_source_all_parameters():
    """Test Redshift source with all parameters set."""
    data = {
        "name": "redshift_full",
        "database": "dev",
        "type": "redshift",
        "host": "my-cluster.abcdefghij.us-east-1.redshift.amazonaws.com",
        "port": 5439,
        "username": "testuser",
        "password": "testpass",
        "db_schema": "analytics",
        "cluster_identifier": "my-cluster",
        "region": "us-east-1",
        "iam": False,
        "ssl": True,
        "connection_pool_size": 8,
    }
    source = RedshiftSource(**data)

    assert source.name == "redshift_full"
    assert source.database == "dev"
    assert source.host == "my-cluster.abcdefghij.us-east-1.redshift.amazonaws.com"
    assert source.port == 5439
    assert source.username == "testuser"
    assert source.db_schema == "analytics"
    assert source.cluster_identifier == "my-cluster"
    assert source.region == "us-east-1"
    assert source.iam is False
    assert source.ssl is True
    assert source.connection_pool_size == 8


@pytest.fixture
def mock_redshift_connector():
    mock_module = MagicMock()
    mock_module.connect.return_value = MagicMock()
    sys.modules["redshift_connector"] = mock_module
    yield mock_module
    del sys.modules["redshift_connector"]


def test_get_connection_ssl_enabled_passes_ssl_params(mock_redshift_connector):
    """Test that ssl=True passes ssl=True and sslmode='require' to connect."""
    source = RedshiftSource(
        name="test",
        database="dev",
        type="redshift",
        host="localhost",
        port=5439,
        username="user",
        password="pass",
        ssl=True,
    )
    source.get_connection()
    call_kwargs = mock_redshift_connector.connect.call_args[1]
    assert call_kwargs["ssl"] is True
    assert call_kwargs["sslmode"] == "require"


def test_get_connection_ssl_disabled_passes_ssl_false(mock_redshift_connector):
    """Test that ssl=False passes ssl=False and no sslmode to connect."""
    source = RedshiftSource(
        name="test",
        database="dev",
        type="redshift",
        host="localhost",
        port=5439,
        username="user",
        password="pass",
        ssl=False,
    )
    source.get_connection()
    call_kwargs = mock_redshift_connector.connect.call_args[1]
    assert call_kwargs["ssl"] is False
    assert "sslmode" not in call_kwargs
