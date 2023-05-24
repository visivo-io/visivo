from visivo.query.query_string_factory import QueryStringFactory
from visivo.query.dialect import Dialect
from visivo.query.trace_tokenizer import TraceTokenizer
from visivo.models.trace import Trace
from visivo.models.tokenized_trace import TokenizedTrace
from sql_formatter.core import format_sql
from tests.factories.model_factories import TargetFactory


def test_QueryStringBuilder_with_only_base_query():
    tokenized_trace = TokenizedTrace(
        base_sql="select * from table", cohort_on='"value"', target="name"
    )
    query_string = QueryStringFactory(tokenized_trace=tokenized_trace).build()
    assert format_sql(query_string) == format_sql(
        """WITH base_query as ( select * from table ) SELECT *, "value" as "cohort_on" FROM base_query\n-- target: name"""
    )


def test_tokenization_query_string_order_by():
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
    target = TargetFactory(type="snowflake")
    trace_tokenizer = TraceTokenizer(trace=trace, target=target)
    tokenized_trace = trace_tokenizer.tokenize()
    query_string = QueryStringFactory(tokenized_trace=tokenized_trace).build()
    assert "ORDER BY a_different_column desc, count(amount) desc" in format_sql(
        query_string
    )
    assert f"-- target: {target.name}" in format_sql(query_string)
