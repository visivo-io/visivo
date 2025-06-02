from visivo.models.base.named_model import NamedModel
from visivo.models.base.context_string import ContextString


def test_NamedModel_get_name():
    assert NamedModel.get_name({"name": "test_name"}) == "test_name"

    model = NamedModel(name="test_model")
    assert NamedModel.get_name(model) == "test_model"

    context_str = ContextString("${ ref(TestName) }")
    assert NamedModel.get_name(context_str) == "TestName"
    assert NamedModel.get_name("${ ref(TestName) }") == "TestName"

    assert NamedModel.get_name("ref(RefName)") == "RefName"
