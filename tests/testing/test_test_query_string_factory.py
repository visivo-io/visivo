from ..factories.model_factories import TraceFactory, TargetFactory
from visivo.testing.test_query_string_factory import TestQueryStringFactory
from visivo.query.query_string_factory import QueryStringFactory
from visivo.query.trace_tokenizer import TraceTokenizer
from visivo.query.dialect import Dialect
from sql_formatter.core import format_sql


def test_TestQueryStringFactory_coordinate_exists():
    trace = TraceFactory(include_tests=True)
    target = TargetFactory()
    test_coordinates_exist = trace.all_tests()[0]
    tokenized_trace = TraceTokenizer(trace=trace, model=trace.model, target=target).tokenize()
    query_string_factory = QueryStringFactory(tokenized_trace=tokenized_trace)
    test_coordinate_exists_string = TestQueryStringFactory(
        test=test_coordinates_exist, query_string_factory=query_string_factory
    ).build()
    expected_sql = """'coordinates x=2, y=1 were not found in any trace cohort' as err_msg """
    assert expected_sql in test_coordinate_exists_string


def test_TestQueryStringFactory_not_null():
    trace = TraceFactory(include_tests=True)
    target = TargetFactory()
    test_not_null = trace.all_tests()[1]
    tokenized_trace = TraceTokenizer(trace=trace, model=trace.model, target=target).tokenize()
    query_string_factory = QueryStringFactory(tokenized_trace=tokenized_trace)
    test_not_null_string = TestQueryStringFactory(
        test=test_not_null, query_string_factory=query_string_factory
    ).build()

    assert """"y" is not null""" in test_not_null_string
    assert """"x" is not null""" in test_not_null_string
