from visivo.models.alert import Alert


def test_Selector_simple_data():
    data = {"name": "alert"}
    alert = Alert(**data)
    assert alert.name == "alert"
