from main import is_pydantic_model
from visivo.models.trace import Trace


def test_is_pydantic_model():
    assert is_pydantic_model(Trace) 

