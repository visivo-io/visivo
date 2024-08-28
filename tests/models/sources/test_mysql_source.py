from visivo.models.sources.mysql_source import MysqlSource


def test_MysqlSource_simple_data():
    data = {"name": "source", "database": "database", "type": "mysql"}
    source = MysqlSource(**data)
    assert source.name == "source"
