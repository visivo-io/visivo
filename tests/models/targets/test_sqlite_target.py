from visivo.models.targets.sqlite_target import SqliteTarget


def test_SqliteModel_simple_data():
    data = {"name": "model", "models": ["ref(other_model)"]}
    model = SqliteTarget(**data)
    assert model.name == "model"
