import os
from tests.support.utils import temp_folder
from tests.factories.model_factories import LocalMergeModelFactory
from pydantic import ValidationError
from visivo.models.models.local_merge_model import LocalMergeModel
from visivo.models.models.sql_model import SqlModel
from visivo.models.sources.postgresql_source import PostgresqlSource
import polars as pl


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
    dataframe = pl.DataFrame(data, schema=["name", "age", "id", "external_id"])
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


def test_local_merge_model_works_without_pandas(mocker):
    """Test that LocalMergeModel operations work without pandas dependency"""
    output_dir = temp_folder()
    os.makedirs(output_dir, exist_ok=True)

    # Create test data using polars (not pandas)
    import polars as pl
    test_data1 = pl.DataFrame({
        "id": [1, 2, 3],
        "name": ["Alice", "Bob", "Charlie"],
        "value": [100, 200, 300]
    })
    
    test_data2 = pl.DataFrame({
        "external_id": [1, 2, 3],
        "category": ["A", "B", "C"],
        "score": [85, 90, 95]
    })

    # Mock the read_sql methods to return polars DataFrames
    mocker.patch(
        "visivo.models.sources.postgresql_source.PostgresqlSource.read_sql",
        side_effect=[test_data1, test_data2]
    )
    
    source1 = PostgresqlSource(database="test", type="postgresql")
    source2 = PostgresqlSource(database="test", type="postgresql")
    
    local_merge_model = LocalMergeModel(
        name="test_local_merge_model",
        sql="SELECT t1.name, t1.value, t2.category, t2.score FROM model1.model t1 JOIN model2.model t2 ON t1.id = t2.external_id",
        models=[
            SqlModel(name="model1", sql="SELECT * FROM table1", source=source1),
            SqlModel(name="model2", sql="SELECT * FROM table2", source=source2),
        ],
    )

    # This should work without pandas
    local_merge_model.insert_duckdb_data(output_dir, local_merge_model.dag())
    
    # Verify the data was processed correctly
    duckdb_source = local_merge_model.get_duckdb_source(output_dir, local_merge_model.dag())
    result = duckdb_source.read_sql("SELECT * FROM model ORDER BY score")
    
    assert result.shape == (3, 4)
    assert list(result.columns) == ["name", "value", "category", "score"]
    assert result["name"].to_list() == ["Alice", "Bob", "Charlie"]
    assert result["score"].to_list() == [85, 90, 95]


def test_local_merge_model_handles_polars_dataframes_correctly(mocker):
    """Test that LocalMergeModel properly converts and handles polars DataFrames"""
    output_dir = temp_folder()
    os.makedirs(output_dir, exist_ok=True)

    import polars as pl
    test_data = pl.DataFrame({
        "x": [1, 2, 3, 4, 5],
        "y": [10, 20, 30, 40, 50]
    })

    mocker.patch(
        "visivo.models.sources.postgresql_source.PostgresqlSource.read_sql",
        return_value=test_data
    )
    
    source = PostgresqlSource(database="test", type="postgresql")
    
    local_merge_model = LocalMergeModel(
        name="polars_test_model",
        sql="SELECT x, y, x * y as product FROM model1.model WHERE x > 2",
        models=[
            SqlModel(name="model1", sql="SELECT * FROM table1", source=source),
        ],
    )

    local_merge_model.insert_duckdb_data(output_dir, local_merge_model.dag())
    
    # Test that calculations work correctly with the converted data
    duckdb_source = local_merge_model.get_duckdb_source(output_dir, local_merge_model.dag())
    result = duckdb_source.read_sql("SELECT SUM(product) as total_product FROM model")
    
    assert result.shape == (1, 1)
    # x=3,y=30: 3*30=90; x=4,y=40: 4*40=160; x=5,y=50: 5*50=250; total=500
    assert result["total_product"].to_list() == [500]
