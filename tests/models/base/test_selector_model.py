from visivo.models.base.selector_model import SelectorModel


class TestSelectorModel(SelectorModel):
    name: str


def test_dumps_parent_name():
    model = TestSelectorModel(**{"name": "name"})
    assert '"parent_name":"name"' in model.model_dump_json()
