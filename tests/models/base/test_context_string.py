from visivo.models.base.context_string import ContextString
from visivo.models.base.parent_model import ParentModel
from tests.factories.model_factories import TraceFactory


def test_ContextString_ref_name():
    context_string = ContextString("")
    assert context_string.get_references() == []

    context_string = ContextString("ref(Name)")
    assert context_string.get_references() == []

    context_string = ContextString("${ ref(Name) }")
    assert context_string.get_references() == ["Name"]
