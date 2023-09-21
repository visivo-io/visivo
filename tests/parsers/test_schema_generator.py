import json
from tests.support.utils import temp_file
from visivo.parsers.schema_generator import generate_schema


def test_generate_schema_replaces_unsupported_javascript():
    schema = generate_schema()
    schema_string = json.dumps(schema)

    assert "?P<ref_name>" in schema_string

    schema_string = schema_string.replace("?P<ref_name>", "")
    tmp = temp_file(name="visivo_schema.json", contents=schema_string)

    assert tmp.exists()
