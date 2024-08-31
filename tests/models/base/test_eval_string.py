from pydantic import Field
from visivo.models.base.context_string import ContextString
from visivo.models.base.base_model import BaseModel
import pytest

from visivo.models.base.eval_string import EvalString


class MockStringModel(BaseModel):
    eval: EvalString = Field(None, description="")


def test_EvalString_get_context_strings():
    context_string = EvalString(">{ }")
    assert context_string.get_context_strings() == []

    context_string = EvalString("> { ref(Name) }")
    assert context_string.get_context_strings() == []

    context_string = EvalString(">{ ${ ref(Name) } }")
    assert context_string.get_context_strings()[0].value == "${ ref(Name) }"

    context_string = EvalString(">{ ${ref(Name)} }")
    assert context_string.get_context_strings()[0].value == "${ref(Name)}"

    context_string = EvalString(">{ ${ ref(Name) } != ${ ref(Name 2) } }")
    assert context_string.get_context_strings()[0].value == "${ ref(Name) }"
    assert context_string.get_context_strings()[1].value == "${ ref(Name 2) }"


def test_EvalString_as_field():
    test_string_model = MockStringModel(**{"eval": ">{ ${ ref(Name) } }"})
    assert test_string_model.eval.get_context_strings()[0].value == "${ ref(Name) }"

    with pytest.raises(ValueError):
        MockStringModel(**{"eval": "{ ref(Name) }"})
