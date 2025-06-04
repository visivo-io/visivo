import os
import click
import pytest
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
    model.args = ["echo", '"']
    output_dir = temp_folder()
    os.makedirs(output_dir, exist_ok=True)
    with pytest.raises(click.ClickException) as exc_info:
        model.insert_csv_to_duckdb(output_dir)
    assert (
        exc_info.value.message
        == f"Error parsing or generating the csv output of model model's command. Verify command's output and try again."
    )


def test_CsvScriptModel_bad_name():
    with pytest.raises(ValidationError) as exc_info:
        CsvScriptModelFactory(table_name="+++")

    error = exc_info.value.errors()[0]

    assert "String should match pattern" in error["msg"]
    assert error["type"] == "string_pattern_mismatch"
