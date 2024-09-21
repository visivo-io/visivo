from visivo.models.sources.snowflake_source import SnowflakeSource


def test_SnowflakeSource_simple_data():
    data = {"name": "source", "database": "database", "type": "snowflake"}
    source = SnowflakeSource(**data)
    assert source.name == "source"
