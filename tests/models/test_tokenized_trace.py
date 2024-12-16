from visivo.models.tokenized_trace import TokenizedTrace
from pydantic import ValidationError
import pytest


def test_TokenizedTrace_simple_data():
    data = {
        "sql": "select * from table",
        "cohort_on": "query(x)",
        "source": "name",
        "source_type": "bigquery",
    }
    trace = TokenizedTrace(**data)
    assert trace.sql == "select * from table"
    assert trace.cohort_on == "query(x)"
    assert trace.source == "name"


def test_TokenizedTrace_missing_data():
    try:
        TokenizedTrace()
    except ValidationError as e:
        error = e.errors()[0]
        assert error["msg"] == "Field required"
        assert error["type"] == "missing"


def test_TokenizedTrace_invalid_order_by_input():
    data = {
        "sql": "select * from table",
        "cohort_on": "widget",
        "groupby_statements": ["widget", "completed_at"],
        "select_items": {"y": "sum(amount)", "x": "completed_at"},
        "order_by": {"no": "dicts allowed!"},
        "source": "name",
        "source_type": "snowflake",
    }
    with pytest.raises(ValidationError) as exc_info:
        TokenizedTrace(**data)

    error = exc_info.value.errors()[0]
    assert error["msg"] == f"Input should be a valid list"
    assert error["type"] == "list_type"
