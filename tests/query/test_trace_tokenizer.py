from visivo.query.trace_tokenizer import TraceTokenizer
from visivo.query.dialect import Dialect
from ..factories.model_factories import TraceFactory
from ..factories.model_factories import TargetFactory
from visivo.models.trace import Trace
import pytest


def test_TraceTonkenizer():
    trace = TraceFactory()
    target = TargetFactory()
    trace_tokenizer = TraceTokenizer(trace=trace, model=trace.model, target=target)
    tokenized_trace = trace_tokenizer.tokenize()
    trace_dict = tokenized_trace.model_dump(exclude_none=True)
    assert trace_dict["sql"] == "select * from test_table"
    assert trace_dict["cohort_on"] == "'values'"
    assert trace_dict["select_items"] == {'props.x': 'x', 'props.y': 'y'}
    assert trace_dict["target"] == "target"


def test_tokenization_with_query_functions():
    data = {
        "name": "query_trace",
        "model": {"sql": "SELECT * FROM widget_sales"},
        "cohort_on": "widget",
        "props": {
            "type": "scatter",
            "x": "query( date_trunc('week', completed_at) )",
            "y": "query( sum(amount) )",
        },
    }
    trace = Trace(**data)
    target = TargetFactory(type="snowflake")
    trace_tokenizer = TraceTokenizer(trace=trace, model=trace.model, target=target)
    tokenized_trace = trace_tokenizer.tokenize()
    assert tokenized_trace.cohort_on == "widget"
    assert tokenized_trace.select_items["props.y"] == "sum(amount)"
    assert tokenized_trace.select_items["props.x"] == "date_trunc('week', completed_at)"
    assert len(tokenized_trace.groupby_statements) == 2
    assert "date_trunc('week', completed_at)" in tokenized_trace.groupby_statements


def test_tokenization_with_column_functions():
    data = {
        "name": "query_trace",
        "model": {"sql": "SELECT * FROM widget_sales"},
        "cohort_on": "widget",
        "columns": {"x": "sum(amount)", "y": "date_trunc('week', completed_at)"},
        "props": {
            "type": "scatter",
            "x": "column(x)",
            "y": "column(y)",
        },
    }
    trace = Trace(**data)
    target = TargetFactory()
    target = TargetFactory(type="snowflake")
    trace_tokenizer = TraceTokenizer(trace=trace, model=trace.model, target=target)
    tokenized_trace = trace_tokenizer.tokenize()
    assert tokenized_trace.cohort_on == "widget"
    assert tokenized_trace.select_items["columns.x"] == "sum(amount)"
    assert (
        tokenized_trace.select_items["columns.y"] == "date_trunc('week', completed_at)"
    )
    assert len(tokenized_trace.groupby_statements) == 2
    assert "date_trunc('week', completed_at)" in tokenized_trace.groupby_statements


def test_tokenization_cohort_on():
    data = {
        "name": "query_trace",
        "model": {"sql": "SELECT * FROM widget_sales"},
        "cohort_on": "query(widget)",
        "props": {
            "type": "scatter",
            "x": "query( date_trunc('week', completed_at) )",
            "y": "query( sum(amount) )",
        },
    }
    trace = Trace(**data)
    target = TargetFactory(type="snowflake")
    trace_tokenizer = TraceTokenizer(trace=trace, model=trace.model, target=target)
    tokenized_trace = trace_tokenizer.tokenize()
    assert tokenized_trace.cohort_on == "widget"
    assert "cohort_on" not in tokenized_trace.select_items.keys()

    data = {
        "name": "query_trace",
        "model": {"sql": "SELECT * FROM widget_sales"},
        "cohort_on": "widget",
        "props": {
            "type": "scatter",
            "x": "query( date_trunc('week', completed_at) )",
            "y": "query( sum(amount) )",
        },
    }
    trace = Trace(**data)
    target = TargetFactory(type="snowflake")
    trace_tokenizer = TraceTokenizer(trace=trace, model=trace.model, target=target)
    tokenized_trace = trace_tokenizer.tokenize()
    assert tokenized_trace.cohort_on == "widget"


def test_tokenization_order_by():
    data = {
        "name": "query_trace",
        "model": {"sql": "SELECT * FROM widget_sales"},
        "cohort_on": "query(widget)",
        "props": {
            "type": "scatter",
            "x": "query( date_trunc('week', completed_at) )",
            "y": "query( sum(amount) )",
        },
        "order_by": [
            "query( a_different_column desc)",
            "query( count(amount) desc )",
        ],
    }
    trace = Trace(**data)
    target = TargetFactory(type="snowflake")
    trace_tokenizer = TraceTokenizer(trace=trace, model=trace.model, target=target)
    tokenized_trace = trace_tokenizer.tokenize()
    assert len(tokenized_trace.order_by) == 2
    assert "count(amount) desc" not in tokenized_trace.groupby_statements
    assert "count(amount)" not in tokenized_trace.groupby_statements
    assert "date_trunc('week', completed_at)" in tokenized_trace.groupby_statements
    assert "a_different_column" in tokenized_trace.groupby_statements


def test_tokenization_order_by_window():
    data = {
        "name": "query_trace",
        "model": {"sql": "SELECT * FROM widget_sales"},
        "props": {"type": "scatter"},
        "order_by": [
            "query( a_different_column desc)",
            "query( count(completed_at)OVER(PARTITION BY widget) )",
        ],
    }
    trace = Trace(**data)
    target = TargetFactory(type="snowflake")
    trace_tokenizer = TraceTokenizer(trace=trace, model=trace.model, target=target)
    tokenized_trace = trace_tokenizer.tokenize()
    assert "count(completed_at)OVER(PARTITION BY widget)" in tokenized_trace.order_by
    assert (
        "count(completed_at)over(partition by widget)"
        in tokenized_trace.groupby_statements
    )


def test_tokenization_filter_window_agg_vanilla():
    data = {
        "name": "query_trace",
        "model": {"sql": "SELECT * FROM widget_sales"},
        "props": {"type": "scatter"},
        "filters": [
            "query( a_different_column = 'value' )",
            "query( count(completed_at)OVER(PARTITION BY widget) > 2 )",
            "query( count(distinct another_column)>2 )",
        ],
    }
    trace = Trace(**data)
    target = TargetFactory(type="snowflake")
    trace_tokenizer = TraceTokenizer(trace=trace, model=trace.model, target=target)
    tokenized_trace = trace_tokenizer.tokenize()
    assert (
        "count(completed_at)OVER(PARTITION BY widget) > 2"
        in tokenized_trace.filter_by["window"]
    )
    assert "count(distinct another_column)>2" in tokenized_trace.filter_by["aggregate"]
    assert "a_different_column = 'value'" in tokenized_trace.filter_by["vanilla"]


def test_tokenization_warn_for_windows_filters_on_non_snowflake():
    data = {
        "name": "query_trace",
        "model": {"sql": "SELECT * FROM widget_sales"},
        "props": {"type": "scatter"},
        "filters": [
            "query( a_different_column = 'value' )",
            "query( count(completed_at)OVER(PARTITION BY widget) > 2 )",
            "query( count(distinct another_column)>2 )",
        ],
    }
    trace = Trace(**data)
    target = TargetFactory(type="sqlite")
    with pytest.warns(Warning, match="Window function filtering") as warn:
        trace_tokenizer = TraceTokenizer(trace=trace, model=trace.model, target=target)

    tokenized_trace = trace_tokenizer.tokenize()

    assert tokenized_trace.filter_by["window"] == []
    assert warn


def test_tokenization_of_nested_inputs():
    data = {
        "name": "query_trace",
        "model": {"sql": "SELECT * FROM widget_sales"},
        "cohort_on": "query(widget)",
        "props": {
            "type": "scatter",
            "x": "query( date_trunc('week', completed_at) )",
            "y": "query( sum(amount) )",
            "marker": {
                "color": "query( case sum(amount) > 200 then 'green' else 'blue' end )",
            },
        },
    }
    trace = Trace(**data)
    target = TargetFactory(type="snowflake")
    trace_tokenizer = TraceTokenizer(trace=trace, model=trace.model, target=target)
    tokenized_trace = trace_tokenizer.tokenize()
    assert (
        tokenized_trace.select_items["props.marker.color"]
        == "case sum(amount) > 200 then 'green' else 'blue' end"
    )
    assert tokenized_trace.select_items["props.x"] == "date_trunc('week', completed_at)"
    assert tokenized_trace.select_items["props.y"] == "sum(amount)"
    assert "sum(amount)" not in tokenized_trace.groupby_statements
