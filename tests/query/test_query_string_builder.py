from visivo.query.query_string_factory import QueryStringFactory
from visivo.query.dialect import Dialect
from visivo.query.trace_tokenizer import TraceTokenizer
from visivo.models.trace import Trace
from visivo.models.tokenized_trace import TokenizedTrace
from sql_formatter.core import format_sql
from tests.factories.model_factories import SnowflakeSourceFactory


def test_QueryStringBuilder_with_only_base_query():
    tokenized_trace = TokenizedTrace(
        sql="select * from table", cohort_on="'value'", source="name"
    )
    query_string = QueryStringFactory(tokenized_trace=tokenized_trace).build()
    assert format_sql(query_string) == format_sql(
        """WITH 
        base_query as (
            select * from table
        ),
        columnize_cohort_on as (
            SELECT 
                *,
                'value' as "cohort_on"
            FROM base_query
        )
        SELECT
                *,
            "cohort_on"
        FROM columnize_cohort_on
            GROUP BY
            "cohort_on" 
        -- source: name"""
    )


def test_tokenization_query_string_order_by():
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
    source = SnowflakeSourceFactory()
    trace_tokenizer = TraceTokenizer(trace=trace, model=trace.model, source=source)
    tokenized_trace = trace_tokenizer.tokenize()
    query_string = QueryStringFactory(tokenized_trace=tokenized_trace).build()
    assert "ORDER BY a_different_column desc, count(amount) desc" in format_sql(
        query_string
    )
    assert f"-- source: {source.name}" in format_sql(query_string)
