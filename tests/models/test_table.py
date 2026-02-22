from visivo.models.table import Table
from visivo.models.base.base_model import REF_PROPERTY_PATTERN
from pydantic import ValidationError
import pytest


def test_Table_simple_data():
    data = {"name": "development", "column_defs": []}
    table = Table(**data)
    assert table.name == "development"


def test_Table_with_trace_simple_data():
    data = {
        "name": "development",
        "column_defs": [],
        "traces": [
            {
                "name": "Trace Name",
                "props": {"type": "scatter", "x": "?{x}", "y": "?{y}"},
                "model": {"sql": "select * from table"},
            }
        ],
    }
    table = Table(**data)
    assert table.name == "development"


def test_Table_with_columns_with_header():
    data = {
        "name": "development",
        "traces": [
            {
                "name": "Trace Name",
                "props": {"type": "scatter", "x": "?{x}", "y": "?{y}"},
                "model": {"sql": "select * from table"},
            }
        ],
        "column_defs": [
            {
                "trace_name": "Trace Name",
                "columns": [{"header": "X Value", "key": "props.x"}],
            }
        ],
    }
    table = Table(**data)
    assert table.column_defs[0].trace_name == "Trace Name"
    assert table.column_defs[0].columns[0].header == "X Value"


def test_Table_ref_string():
    data = {
        "name": "development",
        "traces": ["ref(trace)"],
    }
    table = Table(**data)
    assert table.traces[0] == "ref(trace)"

    data = {
        "name": "development",
        "traces": ["ref(invalid"],
    }
    with pytest.raises(ValidationError) as exc_info:
        Table(**data)

    error = exc_info.value.errors()[0]
    assert error["msg"] == f"String should match pattern '{REF_PROPERTY_PATTERN}'"
    assert error["type"] == "string_pattern_mismatch"


def test_Table_column_def_not_present():
    data = {
        "name": "development",
        "traces": [
            {
                "name": "Trace Name",
                "props": {"type": "scatter", "x": "?{x}", "y": "?{y}"},
                "model": {"sql": "select * from table"},
            }
        ],
        "column_defs": [
            {
                "trace_name": "N/A",
                "columns": [{"header": "X Value", "key": "props.x"}],
            }
        ],
    }

    with pytest.raises(ValidationError) as exc_info:
        Table(**data)

    error = exc_info.value.errors()[0]
    assert (
        error["msg"]
        == f"Value error, Column def trace name 'N/A' is not present in trace list on table."
    )
    assert error["type"] == "value_error"


def test_Table_trace_ref_column_def_not_present():
    data = {
        "name": "development",
        "traces": ["ref(trace)"],
        "column_defs": [
            {
                "trace_name": "N/A",
                "columns": [{"header": "X Value", "key": "props.x"}],
            }
        ],
    }

    with pytest.raises(ValidationError) as exc_info:
        Table(**data)

    error = exc_info.value.errors()[0]
    assert (
        error["msg"]
        == f"Value error, Column def trace name 'N/A' is not present in trace list on table."
    )
    assert error["type"] == "value_error"


def test_Table_with_selector():
    data = {"name": "development", "traces": [], "selector": "ref(Other Selector)"}
    table = Table(**data)
    assert table.selector == "ref(Other Selector)"

    data = {"name": "development", "traces": [], "selector": {"name": "Selector"}}
    table = Table(**data)
    assert table.selector.name == "Selector"


def test_Table_with_singular_insight():
    """Test new singular insight field."""
    data = {
        "name": "revenue-table",
        "insight": "ref(monthly-revenue)",
    }
    table = Table(**data)
    assert table.insight == "ref(monthly-revenue)"
    assert table.name == "revenue-table"


def test_Table_plural_insights_auto_converts_to_singular():
    """Test that plural insights with one item auto-converts to singular."""
    data = {
        "name": "revenue-table",
        "insights": ["ref(monthly-revenue)"],
    }
    with pytest.warns(DeprecationWarning, match="Use 'insight: ref\\(monthly-revenue\\)'"):
        table = Table(**data)

    # Should auto-convert to singular
    assert table.insight == "ref(monthly-revenue)"


def test_Table_plural_insights_with_multiple_raises_error():
    """Test that plural insights with multiple items raises validation error."""
    data = {
        "name": "revenue-table",
        "insights": ["ref(insight1)", "ref(insight2)"],
    }
    with pytest.raises(ValidationError) as exc_info:
        Table(**data)

    error = exc_info.value.errors()[0]
    assert "multiple insights" in error["msg"].lower()


def test_Table_traces_emits_deprecation_warning():
    """Test that traces field emits deprecation warning."""
    data = {
        "name": "revenue-table",
        "traces": ["ref(trace1)"],
    }
    with pytest.warns(DeprecationWarning, match="'traces' field deprecated"):
        table = Table(**data)

    assert table.traces == ["ref(trace1)"]


def test_Table_column_defs_emits_deprecation_warning():
    """Test that column_defs field emits deprecation warning."""
    data = {
        "name": "revenue-table",
        "insight": "ref(monthly-revenue)",
        "column_defs": [
            {
                "insight_name": "monthly-revenue",
                "columns": [{"header": "Month", "key": "month"}],
            }
        ],
    }
    with pytest.warns(DeprecationWarning, match="'column_defs' deprecated"):
        table = Table(**data)

    assert table.column_defs is not None


def test_Table_requires_data_source():
    """Test that table requires at least one data source."""
    data = {"name": "revenue-table"}
    with pytest.raises(ValidationError) as exc_info:
        Table(**data)

    error = exc_info.value.errors()[0]
    assert "must have an 'insight' field" in error["msg"].lower()
