import os
import click
import pytest
from tests.support.utils import temp_folder
from tests.factories.model_factories import LocalMergeModelFactory
from pydantic import ValidationError
from visivo.models.models.local_merge_model import LocalMergeModel
from visivo.models.models.sql_model import SqlModel


def test_LocalMergeModel_simple_data():
    data = {"name": "model", "models": ["ref(other_model)"]}
    model = LocalMergeModel(**data)
    assert model.name == "model"


def test_LocalMergeModel_insert_data():
    model = LocalMergeModelFactory()
    output_dir = temp_folder()
    os.makedirs(output_dir, exist_ok=True)
    model.insert_dependent_models_to_sqlite(output_dir)
    assert model.name == "model"


def test_insert_dependent_models_successfully_inserts_to_sqlite(self):
    output_dir = "tmp"

    local_merge_model = LocalMergeModel(
        name="example_local_merge_model",
        sql="SELECT * FROM table1 tb1 JOIN table2 tb2 ON tb1.id = tbl2.external_id",
        models=[
            SqlModel(name="model1", sql="SELECT * FROM table1"),
            SqlModel(name="model2", sql="SELECT * FROM table2"),
        ],
    )

    local_merge_model.insert_dependent_models_to_sqlite(output_dir)

    assert os.path.exists(f"{output_dir}/model1.sqlite")
    assert os.path.exists(f"{output_dir}/model2.sqlite")


def test_local_merge_model_query_returns_expected_results(self):
    pass
