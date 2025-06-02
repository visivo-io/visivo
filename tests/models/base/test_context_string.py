from pydantic import Field
from visivo.models.base.context_string import ContextString
from visivo.models.base.base_model import BaseModel
import pytest


class MockStringModel(BaseModel):
    ref: ContextString = Field(None, description="")


def test_ContextString_is_context_string():
    assert ContextString.is_context_string("${ ref(Name) }")
    assert ContextString.is_context_string(ContextString("${ ref(Name) }"))
    assert not ContextString.is_context_string("{ ref(Name) }")


def test_ContextString_ref_name():
    context_string = ContextString("")
    assert context_string.get_reference() == None

    context_string = ContextString("${ ref(Name) && ref(Name 2) }")
    assert context_string.get_reference() == None

    context_string = ContextString("${ ref(Name) }")
    assert context_string.get_reference() == "Name"

    context_string = ContextString("${ref(Name)}")
    assert context_string.get_reference() == "Name"

    context_string = ContextString("${ref(Name).property }")
    assert context_string.get_reference() == "Name"

    context_string = ContextString("${ref(Name)}.property[1]")
    assert context_string.get_reference() == "Name"


def test_ContextString_get_path():
    context_string = ContextString("")
    assert context_string.get_path() == None

    context_string = ContextString("${ project.name }")
    assert context_string.get_path() == "project.name"

    context_string = ContextString("${project.dashboards[0].rows[1].items[2]}")
    assert context_string.get_path() == "project.dashboards[0].rows[1].items[2]"

    context_string = ContextString("${ ref(Name) }")
    assert context_string.get_path() == None

    context_string = ContextString("Regular string without path")
    assert context_string.get_path() == None


def test_ContextString_get_ref_props_path():
    context_string = ContextString("")
    assert context_string.get_ref_props_path() == None

    context_string = ContextString("${ ref(Name) }")
    assert context_string.get_ref_props_path() == ""

    context_string = ContextString("${ ref(Name).property }")
    assert context_string.get_ref_props_path() == ".property"

    context_string = ContextString("${ ref(Name).nested.property }")
    assert context_string.get_ref_props_path() == ".nested.property"

    context_string = ContextString("${ ref(Name)[0] }")
    assert context_string.get_ref_props_path() == "[0]"

    context_string = ContextString("${ ref(Name).list[0].property }")
    assert context_string.get_ref_props_path() == ".list[0].property"

    context_string = ContextString("Regular string without ref")
    assert context_string.get_ref_props_path() == None

    context_string = ContextString("${ project.name }")
    assert context_string.get_ref_props_path() == None


def test_ContextString_as_field():
    test_string_model = MockStringModel(**{"ref": "${ ref(Name) }"})
    assert test_string_model.ref.get_reference() == "Name"

    with pytest.raises(ValueError):
        MockStringModel(**{"ref": "{ ref(Name) }"})


def test_ContextString_hash():
    cs1 = ContextString("${ ref(Name) }")
    cs2 = ContextString("${ ref(Name) }")
    assert cs1.__hash__() == cs2.__hash__()

    cs3 = ContextString("${ ref(OtherName) }")
    assert cs1.__hash__() != cs3.__hash__()

    cs4 = ContextString("${ref(Name)}")
    cs5 = ContextString("${  ref(Name)  }")
    assert cs4.__hash__() == cs5.__hash__()

    cs6 = ContextString("${ project.name }")
    cs7 = ContextString("${ project.id }")
    assert cs6.__hash__() != cs7.__hash__()
