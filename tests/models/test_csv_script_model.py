import os
import click
import pytest
from tests.support.utils import temp_folder
from visivo.models.model import CsvScriptModel
from tests.factories.model_factories import CsvScriptModelFactory
from pydantic import ValidationError


def test_CsvScriptModel_simple_data():
    data = {"name": "model", "args": ["echo", "hello"]}
    model = CsvScriptModel(**data)
    assert model.name == "model"


def test_CsvScriptModel_insert_data():
    model = CsvScriptModelFactory()
    output_dir = temp_folder()
    os.makedirs(output_dir, exist_ok=True)
    model.insert_csv_to_sqlite(output_dir)
    assert model.name == "model"


def test_CsvScriptModel_insert_data_bad_csv():
    model = CsvScriptModelFactory()
    model.args = ["echo", '"']
    output_dir = temp_folder()
    os.makedirs(output_dir, exist_ok=True)
    with pytest.raises(click.ClickException) as exc_info:
        model.insert_csv_to_sqlite(output_dir)

    assert (
        exc_info.value.message
        == f"Error parsing csv output of model model's command. Output stored in {output_dir}/model.sqlite. Verify contents and try again."
    )


def test_CsvScriptModel_bad_name():
    with pytest.raises(ValidationError) as exc_info:
        CsvScriptModelFactory(table_name="+++")

    error = exc_info.value.errors()[0]

    assert "String should match pattern" in error["msg"]
    assert error["type"] == "string_pattern_mismatch"
