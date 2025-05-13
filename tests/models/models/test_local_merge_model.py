import os
from tests.support.utils import temp_folder
from tests.factories.model_factories import LocalMergeModelFactory
from pydantic import ValidationError
from visivo.models.models.local_merge_model import LocalMergeModel
from visivo.models.models.sql_model import SqlModel
from visivo.models.sources.postgresql_source import PostgresqlSource
from pandas import DataFrame


def test_LocalMergeModel_simple_data():
    data = {
        "name": "model",
        "sql": "select * from table",
        "models": ["ref(other_model)"],
    }
    model = LocalMergeModel(**data)
    assert model.name == "model"


def test_insert_dependent_models_successfully_inserts_to_duckdb(mocker):
    output_dir = temp_folder()
    os.makedirs(output_dir, exist_ok=True)

    data = [["tom", 10, 1, 1], ["nick", 15, 2, 2], ["juli", 14, 3, 3]]
    dataframe = DataFrame(data, columns=["name", "age", "id", "external_id"])
    mocker.patch(
        "visivo.models.sources.postgresql_source.PostgresqlSource.read_sql",
        return_value=dataframe,
    )
    source1 = PostgresqlSource(database="test", type="postgresql")
    source2 = PostgresqlSource(database="test", type="postgresql")
    local_merge_model = LocalMergeModel(
        name="example_local_merge_model",
        sql="SELECT * FROM table1 tb1 JOIN table2 tb2 ON tb1.id = tbl2.external_id",
        models=[
            SqlModel(name="model1", sql="SELECT * FROM table1", source=source1),
            SqlModel(name="model2", sql="SELECT * FROM table2", source=source2),
        ],
    )

    local_merge_model._insert_dependent_models_to_duckdb(output_dir, local_merge_model.dag())

    assert os.path.exists(f"{output_dir}/models/model1.duckdb")
    assert os.path.exists(f"{output_dir}/models/model2.duckdb")


def test_local_merge_model_get_duckdb_source():
    output_dir = temp_folder()
    os.makedirs(output_dir, exist_ok=True)

    source1 = PostgresqlSource(database="test", type="postgresql")
    source2 = PostgresqlSource(database="test", type="postgresql")
    local_merge_model = LocalMergeModel(
        name="example_local_merge_model",
        sql="SELECT * FROM table1 tb1 JOIN table2 tb2 ON tb1.id = tbl2.external_id",
        models=[
            SqlModel(name="model1", sql="SELECT * FROM table1", source=source1),
            SqlModel(name="model2", sql="SELECT * FROM table2", source=source2),
        ],
    )
    local_merge_model_source = local_merge_model.get_duckdb_source(
        output_dir=output_dir, dag=local_merge_model.dag()
    )
    assert (
        local_merge_model_source.attach[0].source.database == f"{output_dir}/models/model1.duckdb"
    )
    assert local_merge_model_source.attach[0].schema_name == "model1"
    assert (
        local_merge_model_source.attach[1].source.database == f"{output_dir}/models/model2.duckdb"
    )
    assert local_merge_model_source.attach[1].schema_name == "model2"
