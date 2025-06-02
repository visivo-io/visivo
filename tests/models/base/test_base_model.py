from visivo.models.base.base_model import BaseModel
from visivo.models.base.context_string import ContextString


def test_BaseModel_is_ref():
    assert BaseModel.is_ref("ref(Name)")
    assert BaseModel.is_ref("${ ref(Name) }")
    assert BaseModel.is_ref(ContextString("${ ref(Name) }"))
    assert not BaseModel.is_ref("regular string")
    assert not BaseModel.is_ref({"name": "dict object"})
    assert not BaseModel.is_ref(BaseModel())
