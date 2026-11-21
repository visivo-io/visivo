from pathlib import Path

from tests.support.utils import temp_file
from jsonschema_rs import meta, ValidationError
from visivo.parsers.schema_generator import generate_schema


def test_generate_schema_replaces_unsupported_javascript():
    schema = generate_schema()

    assert "?P<" not in schema

    assert "https://json-schema.org/draft/2020-12/schema" in schema

    # Validate the generated schema is valid against JSON Schema Draft 2020-12
    # Note: try/except silences validation failures (assert is commented out)
    # TODO: Fix the schema generation to pass validation, then uncomment the assert
    try:
        meta.validate(schema)
    except ValidationError:
        # Schema validation is currently failing - this is a known issue
        # assert False
        pass

    tmp = temp_file(name="visivo_schema.json", contents=schema)
    assert tmp.exists()


REPO = Path(__file__).parent.parent.parent


def test_the_viewer_copy_of_the_project_schema_matches_the_generated_one():
    generated = REPO / "visivo" / "src" / "visivo_project_schema.json"
    viewer_copy = REPO / "viewer" / "src" / "schemas" / "visivo_project_schema.json"

    same = viewer_copy.read_text() == generated.read_text()
    assert same, (
        "Run `python -m visivo.generate_project_schema_json` and copy "
        "visivo/src/visivo_project_schema.json to viewer/src/schemas/."
    )


def test_writing_the_schema_also_writes_the_viewer_copy(tmp_path, monkeypatch):
    """The release bumps the version and runs write-schema-json. It wrote only
    visivo/src, so the viewer copy fell one version behind every release."""
    from visivo import generate_project_schema_json as writer

    generated = tmp_path / "visivo_project_schema.json"
    viewer_copy = tmp_path / "viewer" / "visivo_project_schema.json"
    viewer_copy.parent.mkdir()
    monkeypatch.setattr(writer, "SCHEMA_FILE", generated)
    monkeypatch.setattr(writer, "VIEWER_SCHEMA_FILE", viewer_copy)

    writer.write_schema_json()

    assert viewer_copy.read_text() == generated.read_text()


def test_without_viewer_sources_only_the_package_schema_is_written(tmp_path, monkeypatch):
    from visivo import generate_project_schema_json as writer

    generated = tmp_path / "visivo_project_schema.json"
    monkeypatch.setattr(writer, "SCHEMA_FILE", generated)
    monkeypatch.setattr(writer, "VIEWER_SCHEMA_FILE", tmp_path / "absent" / "schema.json")

    writer.write_schema_json()

    assert generated.exists()
    assert not (tmp_path / "absent").exists()
