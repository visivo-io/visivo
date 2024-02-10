import os
from tests.support.utils import temp_folder
from visivo.models.model import RunModel
from tests.factories.model_factories import RunModelFactory


def test_RunModel_simple_data():
    data = {"name": "model", "run": "echo 'hello'"}
    model = RunModel(**data)
    assert model.name == "model"


def test_RunModel_insert_data():
    model = RunModelFactory()
    output_dir = temp_folder()
    os.makedirs(output_dir, exist_ok=True)
    model.insert_csv_to_sqlite(output_dir)
    assert model.name == "model"
