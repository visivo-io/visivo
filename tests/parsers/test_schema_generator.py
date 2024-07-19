from tests.support.utils import temp_file
from visivo.parsers.schema_generator import generate_schema


def test_generate_schema_replaces_unsupported_javascript():
    schema = generate_schema()

    assert "?P<ref_name>" not in schema
    assert "?P<column_name>" not in schema
    assert "?P<query_statement>" not in schema

    tmp = temp_file(name="visivo_schema.json", contents=schema)

    assert tmp.exists()
