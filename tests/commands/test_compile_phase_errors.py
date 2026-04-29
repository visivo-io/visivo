"""Tests for compile-phase error visibility (Branch 2: feat/compile-error-visibility).

These tests cover three behaviors:
1. ``error.json`` is written with a structured ``compile_failed`` payload when
   YAML validation fails.
2. ``project.json`` is preserved (not nuked) when compile fails — the viewer
   keeps showing the last-known-good project.
3. ``error.json`` is reset to ``{}`` on successful compile.
"""

import json
import os
from pathlib import Path

import pytest

from tests.factories.model_factories import ProjectFactory, CsvScriptModelFactory
from tests.support.utils import temp_folder, temp_yml_file
from visivo.commands.compile_phase import compile_phase
from visivo.commands.utils import create_file_database
from visivo.parsers.file_names import PROJECT_FILE_NAME
from visivo.parsers.line_validation_error import LineValidationError


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _write_invalid_project_yml(working_dir: str) -> Path:
    """Write a project.visivo.yml whose Insight is missing ``props.type`` AND
    has a stray ``model`` field at the top level — the two most common
    new-user mistakes from the dogfood walkthrough."""
    contents = (
        "name: bad-project\n"
        "sources:\n"
        "  - name: src\n"
        "    type: sqlite\n"
        "    database: ':memory:'\n"
        "models:\n"
        "  - name: m\n"
        "    sql: SELECT 1 AS x\n"
        "    source: ${ref(src)}\n"
        "insights:\n"
        "  - name: bad-insight\n"
        "    model: ${ref(m)}\n"
        "    props:\n"
        "      x: ?{ x }\n"
    )
    path = Path(working_dir) / PROJECT_FILE_NAME
    path.write_text(contents)
    return path


def _compile_valid_project(working_dir: str, output_dir: str) -> None:
    """Compile a known-valid project so target/project.json is populated."""
    project = ProjectFactory()
    project.sources = []
    model = CsvScriptModelFactory(name="csv_model")
    project.dashboards[0].rows[0].items[0].chart.traces[0].model = model
    create_file_database(url=model.get_duckdb_source(output_dir).url(), output_dir=output_dir)

    yml_path = temp_yml_file(
        dict=json.loads(project.model_dump_json()),
        name=PROJECT_FILE_NAME,
        output_dir=working_dir,
    )
    assert yml_path.exists()

    compile_phase(
        default_source=None,
        working_dir=working_dir,
        output_dir=output_dir,
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_compile_writes_structured_error_on_validation_failure():
    output_dir = temp_folder()
    working_dir = temp_folder()
    os.makedirs(working_dir, exist_ok=True)

    _write_invalid_project_yml(working_dir)

    with pytest.raises(LineValidationError):
        compile_phase(
            default_source=None,
            working_dir=working_dir,
            output_dir=output_dir,
        )

    error_path = f"{output_dir}/error.json"
    assert os.path.exists(error_path), "error.json should be written on compile failure"

    with open(error_path) as fp:
        payload = json.load(fp)

    assert payload.get("compile_failed") is True
    assert isinstance(payload.get("errors"), list)
    assert len(payload["errors"]) >= 1
    assert "summary" in payload
    assert "validation errors" in payload["summary"].lower()
    assert "compiled_at" in payload

    # Each error entry should expose the structured Pydantic shape.
    first = payload["errors"][0]
    assert "loc" in first
    assert "msg" in first
    assert "type" in first
    # ``loc`` should be a list of strings (json-serialisable path segments).
    assert isinstance(first["loc"], list)
    assert all(isinstance(part, str) for part in first["loc"])


def test_compile_preserves_project_json_on_failure():
    output_dir = temp_folder()
    working_dir = temp_folder()
    os.makedirs(working_dir, exist_ok=True)

    # 1) First compile a valid project so project.json contains real data.
    _compile_valid_project(working_dir=working_dir, output_dir=output_dir)
    project_path = f"{output_dir}/project.json"
    assert os.path.exists(project_path)
    with open(project_path) as fp:
        good_project_contents = fp.read()
    assert len(good_project_contents) > 2  # not just "{}"

    # 2) Now corrupt the working_dir's project.visivo.yml with an invalid Insight.
    _write_invalid_project_yml(working_dir)

    with pytest.raises(LineValidationError):
        compile_phase(
            default_source=None,
            working_dir=working_dir,
            output_dir=output_dir,
        )

    # 3) project.json must be UNCHANGED — last-known-good state preserved.
    with open(project_path) as fp:
        after_contents = fp.read()
    assert after_contents == good_project_contents, (
        "project.json was overwritten on compile failure; "
        "this nukes the user's last-known-good project."
    )


def test_compile_writes_empty_error_on_success():
    output_dir = temp_folder()
    project = ProjectFactory()
    project.sources = []
    model = CsvScriptModelFactory(name="csv_script_model")
    project.dashboards[0].rows[0].items[0].chart.traces[0].model = model
    create_file_database(url=model.get_duckdb_source(output_dir).url(), output_dir=output_dir)

    tmp = temp_yml_file(dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME)
    working_dir = os.path.dirname(tmp)

    compile_phase(
        default_source=None,
        working_dir=working_dir,
        output_dir=output_dir,
    )

    error_path = f"{output_dir}/error.json"
    assert os.path.exists(error_path)
    with open(error_path) as fp:
        payload = json.load(fp)
    assert payload == {}, "error.json should be emptied on successful compile"


def test_compile_failure_creates_output_dir_if_missing():
    """First-time compile of a brand-new project should still produce
    ``error.json`` even if ``output_dir`` does not yet exist."""
    output_dir = temp_folder()
    # Deliberately do NOT create output_dir up front.
    working_dir = temp_folder()
    os.makedirs(working_dir, exist_ok=True)
    _write_invalid_project_yml(working_dir)

    with pytest.raises(LineValidationError):
        compile_phase(
            default_source=None,
            working_dir=working_dir,
            output_dir=output_dir,
        )

    assert os.path.exists(f"{output_dir}/error.json")
