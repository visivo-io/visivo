from visivo.query.query_writer import QueryWriter
from tests.factories.model_factories import TraceFactory
from tests.support.utils import temp_folder


def test_QueryWriter():
    output_dir = temp_folder()
    query_string = "query string"
    trace = TraceFactory()
    query_writer = QueryWriter(trace=trace, query_string=query_string, output_dir=output_dir)

    query_writer.write()
    assert trace.changed == True

    query_writer.write()
    assert trace.changed == False