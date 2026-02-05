from tests.factories.model_factories import RowFactory, TraceFactory
from visivo.models.selector import Selector
from visivo.models.trace import Trace


def test_Selector_simple_data():
    data = {"name": "selector"}
    selector = Selector(**data)
    assert selector.name == "selector"


def test_Selector_serialize_data():
    trace = TraceFactory(name="trace name")
    selector = Selector(name="selector")
    selector.options = [trace]
    assert selector.serialize_model()["name"] == "selector"
    assert selector.serialize_model()["options"] == [{"name": "trace name", "type": "trace"}]
    assert selector.serialize_model()["type"] == "multiple"
    assert selector.serialize_model()["parent_name"] == "selector"
    row = RowFactory(name="row name")
    selector.options = [row]
    assert selector.serialize_model()["options"] == [{"name": "row name", "type": "row"}]
    selector.options = ["ref(row name)"]
    assert selector.serialize_model()["options"] == ["${ref(row name)}"]

    selector.set_parent_name("parent_name")
    assert selector.serialize_model()["parent_name"] == "parent_name"
