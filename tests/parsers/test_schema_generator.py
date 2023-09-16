import json
from tests.support.utils import temp_file
from visivo.parsers.schema_generator import generate_schema


def test_Core_Parser_with_empty_project():
    schema = generate_schema()
    print(schema)
    tmp = temp_file(name="visivo.schema", contents=json.dumps(schema))

    assert tmp.exists()
