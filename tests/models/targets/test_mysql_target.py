from visivo.models.targets.mysql_target import MysqlTarget


def test_MysqlTarget_simple_data():
    data = {"name": "target", "database": "database", "type": "mysql"}
    target = MysqlTarget(**data)
    assert target.name == "target"
