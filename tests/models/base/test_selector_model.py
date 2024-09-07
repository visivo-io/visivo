from pydantic import ValidationError
from visivo.models.base.selector_model import SelectorModel
import pytest


class TestSelectorModel(SelectorModel):
    name: str


def test_dumps_parent_name_when_selector_present():
    model = TestSelectorModel(**{"name": "name", "selector": {"name": "selector"}})
    assert '"parent_name":"name"' in model.model_dump_json()


def test_dumps_parent_name_when_selector_present():
    model = TestSelectorModel(**{"name": "name"})
    assert not '"parent_name":"name"' in model.model_dump_json()


def test_options_under_object():
    with pytest.raises(ValidationError) as exc_info:
        TestSelectorModel(
            **{
                "name": "name",
                "selector": {"name": "selector", "options": ["ref(option1)"]},
            }
        )

    error = exc_info.value.errors()[0]
    assert (
        error["msg"]
        == "Value error, Selector 'selector' can not have options set, they are set from the parent item."
    )
    assert error["type"] == "value_error"
