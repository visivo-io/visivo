from pydantic import Field
from visivo.models.base.context_string import ContextString
from visivo.models.base.base_model import BaseModel
import pytest


class MockStringModel(BaseModel):
    ref: ContextString = Field(None, description="")


def test_ContextString_ref_name():
    context_string = ContextString("")
    assert context_string.get_reference() == None

    context_string = ContextString("${ ref(Name) && ref(Name 2) }")
    assert context_string.get_reference() == None

    context_string = ContextString("${ ref(Name) }")
    assert context_string.get_reference() == "Name"

    context_string = ContextString("${ref(Name)}")
    assert context_string.get_reference() == "Name"


def test_ContextString_as_field():
    test_string_model = MockStringModel(**{"ref": "${ ref(Name) }"})
    assert test_string_model.ref.get_reference() == "Name"

    with pytest.raises(ValueError):
        MockStringModel(**{"ref": "{ ref(Name) }"})
