import os
import click
import pytest
import io
from tests.support.utils import temp_folder
from tests.factories.model_factories import CsvScriptModelFactory
from pydantic import ValidationError
from visivo.models.models.csv_script_model import CsvScriptModel


def test_CsvScriptModel_simple_data():
    data = {"name": "model", "args": ["echo", "hello"]}
    model = CsvScriptModel(**data)
    assert model.name == "model"


def test_CsvScriptModel_no_name():
    data = {"args": ["echo", "hello"]}
    with pytest.raises(ValidationError) as exc_info:
        CsvScriptModel(**data)

    error = exc_info.value.errors()[0]

    assert "Field required" in error["msg"]
    assert error["type"] == "missing"


def test_CsvScriptModel_insert_data():
    model = CsvScriptModelFactory()
    output_dir = temp_folder()
    os.makedirs(output_dir, exist_ok=True)
    model.insert_csv_to_duckdb(output_dir)
    assert model.name == "model"


def test_CsvScriptModel_insert_data_bad_csv():
    model = CsvScriptModelFactory()
    model.args = ["echo", "col\n1,2"]
    output_dir = temp_folder()
    os.makedirs(output_dir, exist_ok=True)
    with pytest.raises(click.ClickException) as exc_info:
        model.insert_csv_to_duckdb(output_dir)
    assert "Row 2 has 2 columns but expected 1" in exc_info.value.message


def test_CsvScriptModel_bad_name():
    with pytest.raises(ValidationError) as exc_info:
        CsvScriptModelFactory(table_name="+++")

    error = exc_info.value.errors()[0]

    assert "String should match pattern" in error["msg"]
    assert error["type"] == "string_pattern_mismatch"


def test_CsvScriptModel_validate_stream_empty_csv():
    model = CsvScriptModelFactory()
    empty_csv = io.StringIO("")
    with pytest.raises(click.ClickException) as exc_info:
        model.validate_stream_is_csv(empty_csv)
    assert "did not return any data" in exc_info.value.message
    assert "Verify command's output" in exc_info.value.message


def test_CsvScriptModel_validate_stream_inconsistent_rows():
    model = CsvScriptModelFactory()
    inconsistent_csv = io.StringIO("col1,col2\n1,2,3\n4,5")  # Second row has 3 columns
    with pytest.raises(click.ClickException) as exc_info:
        model.validate_stream_is_csv(inconsistent_csv)
    assert "CSV parsing error" in exc_info.value.message
    assert "Row 2 has 3 columns but expected 2" in exc_info.value.message


def test_CsvScriptModel_validate_stream_empty_allowed():
    model = CsvScriptModelFactory(allow_empty=True)
    empty_csv = io.StringIO("")
    # Should not raise an exception
    model.validate_stream_is_csv(empty_csv)
