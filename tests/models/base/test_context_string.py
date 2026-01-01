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


# Tests for new ${refs.name} syntax
class TestNewRefsSyntax:
    """Tests for the new ${refs.name} syntax support."""

    def test_is_context_string_with_refs_syntax(self):
        """Test that ${refs.name} is recognized as context string."""
        assert ContextString.is_context_string("${refs.orders}")
        assert ContextString.is_context_string("${refs.orders.user_id}")
        assert ContextString.is_context_string(ContextString("${refs.orders}"))

    def test_get_reference_with_refs_syntax(self):
        """Test extracting reference name from ${refs.name} syntax."""
        cs = ContextString("${refs.orders}")
        assert cs.get_reference() == "orders"

        cs = ContextString("${refs.my-model}")
        assert cs.get_reference() == "my-model"

        cs = ContextString("${refs.orders.user_id}")
        assert cs.get_reference() == "orders"

    def test_get_ref_props_path_with_refs_syntax(self):
        """Test extracting property path from ${refs.name.property} syntax."""
        cs = ContextString("${refs.orders}")
        assert cs.get_ref_props_path() == ""

        cs = ContextString("${refs.orders.user_id}")
        assert cs.get_ref_props_path() == ".user_id"

        cs = ContextString("${refs.orders.nested.property}")
        assert cs.get_ref_props_path() == ".nested.property"

    def test_uses_refs_syntax_detection(self):
        """Test detection of which syntax is used."""
        cs_new = ContextString("${refs.orders}")
        assert cs_new.uses_refs_syntax() is True
        assert cs_new.uses_ref_syntax() is False

        cs_legacy = ContextString("${ref(orders)}")
        assert cs_legacy.uses_refs_syntax() is False
        assert cs_legacy.uses_ref_syntax() is True

    def test_get_ref_attr_with_refs_syntax(self):
        """Test get_ref_attr returns the full ref string."""
        cs = ContextString("x = ${refs.orders}")
        assert cs.get_ref_attr() == "${refs.orders}"

        cs = ContextString("x = ${refs.orders.user_id}")
        assert cs.get_ref_attr() == "${refs.orders.user_id}"

    def test_as_field_with_refs_syntax(self):
        """Test that ${refs.name} works as a Pydantic field value."""
        model = MockStringModel(**{"ref": "${refs.orders}"})
        assert model.ref.get_reference() == "orders"

        model = MockStringModel(**{"ref": "${refs.orders.user_id}"})
        assert model.ref.get_reference() == "orders"
