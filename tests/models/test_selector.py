from visivo.models.selector import Selector
from visivo.models.base.base_model import REF_REGEX
from pydantic import ValidationError
import pytest


def test_Selector_simple_data():
    data = {"name": "selector"}
    selector = Selector(**data)
    assert selector.name == "selector"


def test_Selector_serialize_data():
    data = {"name": "selector"}
    selector = Selector(**data)
    assert selector.serialize_model()["name"] == "selector"
    assert selector.serialize_model()["options"] == []
    assert selector.serialize_model()["type"] == "multiple"
    assert selector.serialize_model()["parent_name"] == "selector"

    selector.set_parent_name("parent_name")
    assert selector.serialize_model()["parent_name"] == "parent_name"
