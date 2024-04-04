from visivo.models.targets.snowflake_target import SnowflakeTarget


def test_SnowflakeTarget_simple_data():
    data = {"name": "target", "database": "database", "type": "snowflake"}
    target = SnowflakeTarget(**data)
    assert target.name == "target"
