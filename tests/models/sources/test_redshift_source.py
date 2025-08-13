import pytest
import click
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

    # Check connect args include IAM settings
    connect_args = source.connect_args()
    assert connect_args["iam"] is True
    assert connect_args["cluster_identifier"] == "my-cluster"
    assert connect_args["region"] == "us-east-1"


def test_redshift_source_ssl_enabled():
    """Test Redshift source with SSL enabled (default)."""
    data = {"name": "redshift_ssl", "database": "dev", "type": "redshift"}
    source = RedshiftSource(**data)
    assert source.ssl is True

    connect_args = source.connect_args()
    assert connect_args["sslmode"] == "require"


def test_redshift_source_ssl_disabled():
    """Test Redshift source with SSL disabled."""
    data = {"name": "redshift_no_ssl", "database": "dev", "type": "redshift", "ssl": False}
    source = RedshiftSource(**data)
    assert source.ssl is False

    connect_args = source.connect_args()
    assert "sslmode" not in connect_args


def test_redshift_source_get_dialect():
    """Test that Redshift source returns correct dialect."""
    data = {"name": "source", "database": "database", "type": "redshift"}
    source = RedshiftSource(**data)
    assert source.get_dialect() == "redshift+redshift_connector"


def test_redshift_source_url_construction():
    """Test URL construction for Redshift."""
    data = {
        "name": "redshift_url_test",
        "database": "dev",
        "type": "redshift",
        "host": "my-cluster.abcdefghij.us-east-1.redshift.amazonaws.com",
        "port": 5439,
        "username": "testuser",
        "password": "testpass",
    }
    source = RedshiftSource(**data)
    url = source.url()

    assert str(url).startswith("redshift+redshift_connector://")
    assert "testuser" in str(url)
    assert "my-cluster.abcdefghij.us-east-1.redshift.amazonaws.com" in str(url)
    assert "5439" in str(url)
    assert "dev" in str(url)


def test_redshift_source_url_construction_with_iam():
    """Test URL construction for Redshift with IAM (no password in URL)."""
    data = {
        "name": "redshift_iam_url",
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
    url = source.url()

    assert str(url).startswith("redshift+redshift_connector://")
    assert "testuser" in str(url)
    # Should not contain password when using IAM
    assert ":" not in str(url).split("@")[0].split("//")[1]


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

    with pytest.raises(click.ClickException) as exc_info:
        source.read_sql("SELECT 1")

    assert "Error connecting to source 'bad_redshift'" in exc_info.value.message
    assert (
        "Ensure the database is running and the connection properties are correct"
        in exc_info.value.message
    )


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
