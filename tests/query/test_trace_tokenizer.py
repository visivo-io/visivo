from visivo.query.trace_tokenizer import TraceTokenizer
from visivo.query.dialect import Dialect
from ..factories.model_factories import TraceFactory
from visivo.models.trace import Trace
import pytest


def test_TraceTonkenizer():
    trace = TraceFactory()
    dialect = Dialect(type="sqlite")
    trace_tokenizer = TraceTokenizer(trace=trace, dialect=dialect)
    tonkenized_trace = trace_tokenizer.tokenize()
    tonkenized_trace.dict(exclude_none=True)
    assert {
        "base_sql": "select * from test_table",
        "cohort_on": "'values'",
        "select_items": {},
    } == tonkenized_trace.dict(exclude_none=True)


def test_tokenization_with_query_functions():
    data = {
        "name": "query_trace",
        "base_sql": "SELECT * FROM widget_sales",
        "cohort_on": "widget",
        "x": "query( date_trunc('week', completed_at) )",
        "y": "query( sum(amount) )",
    }
    trace = Trace(**data)
    dialect = Dialect(type="snowflake")
    trace_tokenizer = TraceTokenizer(trace=trace, dialect=dialect)
    tonkenized_trace = trace_tokenizer.tokenize()
    assert tonkenized_trace.cohort_on == "widget"
    assert tonkenized_trace.select_items["y"] == "sum(amount)"
    assert tonkenized_trace.select_items["x"] == "date_trunc('week', completed_at)"
    assert len(tonkenized_trace.groupby_statements) == 2
    assert "date_trunc('week', completed_at)" in tonkenized_trace.groupby_statements


def test_tokenization_cohort_on():
    data = {
        "name": "query_trace",
        "base_sql": "SELECT * FROM widget_sales",
        "cohort_on": "query(widget)",
        "x": "query( date_trunc('week', completed_at) )",
        "y": "query( sum(amount) )",
    }
    trace = Trace(**data)
    dialect = Dialect(type="snowflake")
    trace_tokenizer = TraceTokenizer(trace=trace, dialect=dialect)
    tonkenized_trace = trace_tokenizer.tokenize()
    assert tonkenized_trace.cohort_on == "widget"
    assert "cohort_on" not in tonkenized_trace.select_items.keys()

    data = {
        "name": "query_trace",
        "base_sql": "SELECT * FROM widget_sales",
        "cohort_on": "widget",
        "x": "query( date_trunc('week', completed_at) )",
        "y": "query( sum(amount) )",
    }
    trace = Trace(**data)
    dialect = Dialect(type="snowflake")
    trace_tokenizer = TraceTokenizer(trace=trace, dialect=dialect)
    tonkenized_trace = trace_tokenizer.tokenize()
    assert tonkenized_trace.cohort_on == "widget"


def test_tokenization_order_by():
    data = {
        "name": "query_trace",
        "base_sql": "SELECT * FROM widget_sales",
        "cohort_on": "query(widget)",
        "x": "query( date_trunc('week', completed_at) )",
        "y": "query( sum(amount) )",
        "order_by": [
            "query( a_different_column desc)",
            "query( count(amount) desc )",
        ],
    }
    trace = Trace(**data)
    dialect = Dialect(type="snowflake")
    trace_tokenizer = TraceTokenizer(trace=trace, dialect=dialect)
    tonkenized_trace = trace_tokenizer.tokenize()
    assert len(tonkenized_trace.order_by) == 2
    assert "count(amount) desc" not in tonkenized_trace.groupby_statements
    assert "count(amount)" not in tonkenized_trace.groupby_statements
    assert "date_trunc('week', completed_at)" in tonkenized_trace.groupby_statements
    assert "a_different_column" in tonkenized_trace.groupby_statements


def test_tokenization_order_by_window():
    data = {
        "name": "query_trace",
        "base_sql": "SELECT * FROM widget_sales",
        "order_by": [
            "query( a_different_column desc)",
            "query( count(completed_at)OVER(PARTITION BY widget) )",
        ],
    }
    trace = Trace(**data)
    dialect = Dialect(type="snowflake")
    trace_tokenizer = TraceTokenizer(trace=trace, dialect=dialect)
    tonkenized_trace = trace_tokenizer.tokenize()
    assert "count(completed_at)OVER(PARTITION BY widget)" in tonkenized_trace.order_by
    assert (
        "count(completed_at)over(partition by widget)"
        in tonkenized_trace.groupby_statements
    )


def test_tokenization_filter_window_agg_vanilla():
    data = {
        "name": "query_trace",
        "base_sql": "SELECT * FROM widget_sales",
        "filters": [
            "query( a_different_column = 'value' )",
            "query( count(completed_at)OVER(PARTITION BY widget) > 2 )",
            "query( count(distinct another_column)>2 )",
        ],
    }
    trace = Trace(**data)
    dialect = Dialect(type="snowflake")
    trace_tokenizer = TraceTokenizer(trace=trace, dialect=dialect)
    tonkenized_trace = trace_tokenizer.tokenize()
    assert (
        "count(completed_at)OVER(PARTITION BY widget) > 2"
        in tonkenized_trace.filter_by["window"]
    )
    assert "count(distinct another_column)>2" in tonkenized_trace.filter_by["aggregate"]
    assert "a_different_column = 'value'" in tonkenized_trace.filter_by["vanilla"]


def test_tokenization_warn_for_windows_filters_on_non_snowflake():
    data = {
        "name": "query_trace",
        "base_sql": "SELECT * FROM widget_sales",
        "filters": [
            "query( a_different_column = 'value' )",
            "query( count(completed_at)OVER(PARTITION BY widget) > 2 )",
            "query( count(distinct another_column)>2 )",
        ],
    }
    trace = Trace(**data)
    dialect = Dialect(type="sqlite")
    with pytest.warns(Warning, match="Window function filtering") as warn:
        trace_tokenizer = TraceTokenizer(trace=trace, dialect=dialect)

    tonkenized_trace = trace_tokenizer.tokenize()

    assert tonkenized_trace.filter_by["window"] == []
    assert warn


def test_tokenization_of_nested_inputs():
    data = {
        "name": "query_trace",
        "base_sql": "SELECT * FROM widget_sales",
        "cohort_on": "query(widget)",
        "x": "query( date_trunc('week', completed_at) )",
        "y": "query( sum(amount) )",
        "marker": {
            "color": "query( case sum(amount) > 200 then 'green' else 'blue' end )",
            "shape": "square",
        },
    }
    trace = Trace(**data)
    dialect = Dialect(type="snowflake")
    trace_tokenizer = TraceTokenizer(trace=trace, dialect=dialect)
    tonkenized_trace = trace_tokenizer.tokenize()
    assert (
        tonkenized_trace.select_items["marker.color"]
        == "case sum(amount) > 200 then 'green' else 'blue' end"
    )
    assert tonkenized_trace.select_items["x"] == "date_trunc('week', completed_at)"
    assert tonkenized_trace.select_items["y"] == "sum(amount)"
    assert "sum(amount)" not in tonkenized_trace.groupby_statements
