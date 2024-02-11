import os
from tests.support.utils import temp_folder
from visivo.models.model import CsvScriptModel
from tests.factories.model_factories import CsvScriptModelFactory


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
