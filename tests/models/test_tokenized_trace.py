from visivo.models.tokenized_trace import TokenizedTrace
from pydantic import ValidationError
import pytest


def test_TokenizedTrace_simple_data():
    data = {
        "base_sql": "select * from table",
        "cohort_on": "query(x)",
    }
    trace = TokenizedTrace(**data)
    assert trace.base_sql == "select * from table"
    assert trace.cohort_on == "query(x)"


def test_TokenizedTrace_missing_data():
    try:
        TokenizedTrace()
    except ValidationError as e:
        error = e.errors()[0]
        assert error["msg"] == "field required"
        assert error["type"] == "value_error.missing"


def test_TokenizedTrace_invalid_order_by_input():
    data = {
        "base_sql": "select * from table",
        "cohort_on": "widget",
        "groupby_statements": ["widget", "completed_at"],
        "select_items": {"y": "sum(amount)", "x": "completed_at"},
        "order_by": {"no": "dicts allowed!"},
    }
    with pytest.raises(ValidationError) as exc_info:
        TokenizedTrace(**data)
    
    error = exc_info.value.errors()[0]
    assert error["msg"] == f"value is not a valid list"
    assert error["type"] == "type_error.list"
