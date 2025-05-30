from visivo.models.sources.snowflake_source import SnowflakeSource


def test_SnowflakeSource_simple_data():
    data = {"name": "source", "database": "database", "type": "snowflake"}
    source = SnowflakeSource(**data)
    assert source.name == "source"


def test_SnowflakeSource_key_authentication():
    data = {
        "name": "source",
        "database": "database",
        "type": "snowflake",
        "private_key_path": "tests/fixtures/key_with_password.p8",
        "private_key_passphrase": "password",
    }
    source = SnowflakeSource(**data)
    assert source.name == "source"
    assert source.private_key_path == "tests/fixtures/key_with_password.p8"
    assert "0\\" in str(source.connect_args()["private_key"])


def test_SnowflakeSource_key_authentication_no_passphrase():
    data = {
        "name": "source",
        "database": "database",
        "type": "snowflake",
        "private_key_path": "tests/fixtures/key_without_password.p8",
    }
    source = SnowflakeSource(**data)
    assert source.name == "source"
    assert source.private_key_path == "tests/fixtures/key_without_password.p8"
    assert "0\\" in str(source.connect_args()["private_key"])
