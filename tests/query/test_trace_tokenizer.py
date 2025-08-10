from visivo.query.trace_tokenizer import TraceTokenizer
from visivo.query.dialect import Dialect
from tests.factories.model_factories import SnowflakeSourceFactory, TraceFactory
from tests.factories.model_factories import SourceFactory
from visivo.models.trace import Trace
import pytest


def test_TraceTonkenizer():
    trace = TraceFactory()
    source = SourceFactory()
    trace_tokenizer = TraceTokenizer(trace=trace, model=trace.model, source=source)
    tokenized_trace = trace_tokenizer.tokenize()
    trace_dict = tokenized_trace.model_dump(exclude_none=True)
    assert trace_dict["sql"] == "select * from test_table"
    assert trace_dict["select_items"] == {"props.x": "x", "props.y": "y"}
    assert trace_dict["source"] == "source"


def test_TraceTonkenizer_surface():
    trace = TraceFactory(surface_props=True)
    source = SourceFactory()
    trace_tokenizer = TraceTokenizer(trace=trace, model=trace.model, source=source)
    tokenized_trace = trace_tokenizer.tokenize()
    trace_dict = tokenized_trace.model_dump(exclude_none=True)
    assert trace_dict["sql"] == "select * from test_table"
    assert trace_dict["select_items"] == {"props.z.0": "x+10", "props.z.1": "y+15"}
    assert trace_dict["source"] == "source"


def test_TraceTonkenizer_without_name():
    trace = TraceFactory()
    trace.name = None
    source = SourceFactory()
    trace_tokenizer = TraceTokenizer(trace=trace, model=trace.model, source=source)
    tokenized_trace = trace_tokenizer.tokenize()
    trace_dict = tokenized_trace.model_dump(exclude_none=True)
    assert trace_dict["sql"] == "select * from test_table"
    assert trace_dict["select_items"] == {"props.x": "x", "props.y": "y"}
    assert trace_dict["source"] == "source"


def test_tokenization_with_query_functions():
    data = {
        "name": "query_trace",
        "model": {"sql": "SELECT * FROM widget_sales"},
        "props": {
            "type": "scatter",
            "x": "?{ date_trunc('week', completed_at) }",
            "y": "?{ sum(amount) }",
        },
    }
    trace = Trace(**data)
    source = SnowflakeSourceFactory()
    trace_tokenizer = TraceTokenizer(trace=trace, model=trace.model, source=source)
    tokenized_trace = trace_tokenizer.tokenize()
    assert tokenized_trace.select_items["props.y"] == "sum(amount)"
    assert tokenized_trace.select_items["props.x"] == "date_trunc('week', completed_at)"
    assert len(tokenized_trace.groupby_statements) == 2
    assert "date_trunc('week', completed_at)" in tokenized_trace.groupby_statements


def test_tokenization_with_column_functions():
    data = {
        "name": "query_trace",
        "model": {"sql": "SELECT * FROM widget_sales"},
        "columns": {"x": "?{sum(amount)}", "y": "?{date_trunc('week', completed_at)}"},
        "props": {
            "type": "scatter",
            "x": "column(x)",
            "y": "column(y)",
        },
    }
    trace = Trace(**data)
    source = SourceFactory()
    source = SnowflakeSourceFactory()
    trace_tokenizer = TraceTokenizer(trace=trace, model=trace.model, source=source)
    tokenized_trace = trace_tokenizer.tokenize()
    assert tokenized_trace.select_items["columns.x"] == "sum(amount)"
    assert tokenized_trace.select_items["columns.y"] == "date_trunc('week', completed_at)"
    assert len(tokenized_trace.groupby_statements) == 2
    assert "date_trunc('week', completed_at)" in tokenized_trace.groupby_statements


def test_tokenization_order_by():
    data = {
        "name": "query_trace",
        "model": {"sql": "SELECT * FROM widget_sales"},
        "props": {
            "type": "scatter",
            "x": "?{ date_trunc('week', completed_at) }",
            "y": "?{ sum(amount) }",
        },
        "order_by": [
            "?{ a_different_column desc}",
            "?{ count(amount) desc }",
        ],
    }
    trace = Trace(**data)
    source = SnowflakeSourceFactory()
    trace_tokenizer = TraceTokenizer(trace=trace, model=trace.model, source=source)
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
            "?{ a_different_column desc}",
            "?{ count(completed_at)OVER(PARTITION BY widget) }",
        ],
    }
    trace = Trace(**data)
    source = SnowflakeSourceFactory()
    trace_tokenizer = TraceTokenizer(trace=trace, model=trace.model, source=source)
    tokenized_trace = trace_tokenizer.tokenize()
    assert "count(completed_at)OVER(PARTITION BY widget)" in tokenized_trace.order_by
    assert "count(completed_at)over(partition by widget)" in tokenized_trace.groupby_statements


def test_tokenization_filter_window_agg_vanilla():
    data = {
        "name": "query_trace",
        "model": {"sql": "SELECT * FROM widget_sales"},
        "props": {"type": "scatter"},
        "filters": [
            "?{ a_different_column = 'value' }",
            "?{ count(completed_at)OVER(PARTITION BY widget) > 2 }",
            "?{ count(distinct another_column)>2 }",
        ],
    }
    trace = Trace(**data)
    source = SnowflakeSourceFactory()
    trace_tokenizer = TraceTokenizer(trace=trace, model=trace.model, source=source)
    tokenized_trace = trace_tokenizer.tokenize()
    assert "count(completed_at)OVER(PARTITION BY widget) > 2" in tokenized_trace.filter_by["window"]
    assert "count(distinct another_column)>2" in tokenized_trace.filter_by["aggregate"]
    assert "a_different_column = 'value'" in tokenized_trace.filter_by["vanilla"]


def test_tokenization_warn_for_windows_filters_on_non_snowflake():
    data = {
        "name": "query_trace",
        "model": {"sql": "SELECT * FROM widget_sales"},
        "props": {"type": "scatter"},
        "filters": [
            "?{ a_different_column = 'value' }",
            "?{ count(completed_at)OVER(PARTITION BY widget) > 2 }",
            "?{ count(distinct another_column)>2 }",
        ],
    }
    trace = Trace(**data)
    source = SourceFactory(type="sqlite")
    with pytest.warns(Warning, match="Window function filtering") as warn:
        trace_tokenizer = TraceTokenizer(trace=trace, model=trace.model, source=source)

    tokenized_trace = trace_tokenizer.tokenize()

    assert tokenized_trace.filter_by["window"] == []
    assert warn


def test_tokenization_of_nested_inputs():
    data = {
        "name": "query_trace",
        "model": {"sql": "SELECT * FROM widget_sales"},
        "props": {
            "type": "scatter",
            "x": "?{ date_trunc('week', completed_at) }",
            "y": "?{ sum(amount) }",
            "marker": {
                "color": "?{ case sum(amount) > 200 then 'green' else 'blue' end }",
            },
        },
    }
    trace = Trace(**data)
    source = SnowflakeSourceFactory()
    trace_tokenizer = TraceTokenizer(trace=trace, model=trace.model, source=source)
    tokenized_trace = trace_tokenizer.tokenize()
    assert (
        tokenized_trace.select_items["props.marker.color"]
        == "case sum(amount) > 200 then 'green' else 'blue' end"
    )
    assert tokenized_trace.select_items["props.x"] == "date_trunc('week', completed_at)"
    assert tokenized_trace.select_items["props.y"] == "sum(amount)"
    assert "sum(amount)" not in tokenized_trace.groupby_statements
