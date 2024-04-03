import os
import click
import pytest
from tests.support.utils import temp_folder
from tests.factories.model_factories import LocalMergeModelFactory
from pydantic import ValidationError
from visivo.models.models.local_merge_model import LocalMergeModel
from visivo.models.models.sql_model import SqlModel
from visivo.models.targets.postgresql_target import PostgresqlTarget
from pandas import DataFrame


def test_LocalMergeModel_simple_data():
    data = {"name": "model", "models": ["ref(other_model)"]}
    model = LocalMergeModel(**data)
    assert model.name == "model"


def test_insert_dependent_models_successfully_inserts_to_sqlite(mocker):
    output_dir = temp_folder()
    os.makedirs(output_dir, exist_ok=True)

    data = [["tom", 10, 1, 1], ["nick", 15, 2, 2], ["juli", 14, 3, 3]]
    dataframe = DataFrame(data, columns=["name", "age", "id", "external_id"])
    mocker.patch(
        "visivo.models.targets.postgresql_target.PostgresqlTarget.read_sql",
        return_value=dataframe,
    )
    target1 = PostgresqlTarget(database="test", type="postgresql")
    target2 = PostgresqlTarget(database="test", type="postgresql")
    local_merge_model = LocalMergeModel(
        name="example_local_merge_model",
        sql="SELECT * FROM table1 tb1 JOIN table2 tb2 ON tb1.id = tbl2.external_id",
        models=[
            SqlModel(name="model1", sql="SELECT * FROM table1", target=target1),
            SqlModel(name="model2", sql="SELECT * FROM table2", target=target2),
        ],
    )

    local_merge_model.insert_dependent_models_to_sqlite(output_dir)

    assert os.path.exists(f"{output_dir}/model1.sqlite")
    assert os.path.exists(f"{output_dir}/model2.sqlite")


def test_local_merge_model_get_sqlite_target():
    output_dir = temp_folder()
    os.makedirs(output_dir, exist_ok=True)

    target1 = PostgresqlTarget(database="test", type="postgresql")
    target2 = PostgresqlTarget(database="test", type="postgresql")
    local_merge_model = LocalMergeModel(
        name="example_local_merge_model",
        sql="SELECT * FROM table1 tb1 JOIN table2 tb2 ON tb1.id = tbl2.external_id",
        models=[
            SqlModel(name="model1", sql="SELECT * FROM table1", target=target1),
            SqlModel(name="model2", sql="SELECT * FROM table2", target=target2),
        ],
    )
    local_merge_model_target = local_merge_model.get_sqlite_target(
        output_dir=output_dir
    )
    assert (
        local_merge_model_target.attach[0].target.database
        == f"{output_dir}/model1.sqlite"
    )
    assert local_merge_model_target.attach[0].schema_name == "model1"
    assert (
        local_merge_model_target.attach[1].target.database
        == f"{output_dir}/model2.sqlite"
    )
    assert local_merge_model_target.attach[1].schema_name == "model2"
