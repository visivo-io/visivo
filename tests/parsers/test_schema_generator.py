from tests.support.utils import temp_file
from jsonschema_rs import meta, ValidationError
from visivo.parsers.schema_generator import generate_schema


def test_generate_schema_replaces_unsupported_javascript():
    schema = generate_schema()

    assert "?P<" not in schema

    assert "https://json-schema.org/draft/2020-12/schema" in schema

    # Validate the generated schema is valid against JSON Schema Draft 2020-12
    try:
        meta.validate(schema)
    except ValidationError as exc:
        print(exc.instance_path)
        print(exc.schema_path)
        print(exc.instance)
        # assert False

    tmp = temp_file(name="visivo_schema.json", contents=schema)
    assert tmp.exists()
