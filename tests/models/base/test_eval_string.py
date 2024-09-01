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


def test_evaluate():
    # Test basic arithmetic
    es = EvalString(">{ True }")
    assert es.evaluate() == True

    es = EvalString(">{ 2 + 3 * 4 }")
    assert es.evaluate() == 14

    es = EvalString(">{ 5 > 3 and 2 <= 2 }")
    assert es.evaluate() == True

    es = EvalString(">{ any_test_failed() }")
    assert es.evaluate() == False

    es = EvalString(">{ any_test_failed() == False }")
    assert es.evaluate() == True

    es = EvalString(">{ env.ENVIRONMENT == 'PRODUCTION' }")
    assert es.evaluate() == False

    with pytest.raises(ValueError):
        EvalString(">{ unsupported_function() }").evaluate()

    with pytest.raises(ValueError):
        EvalString(">{ 1 + 'string' }").evaluate()
