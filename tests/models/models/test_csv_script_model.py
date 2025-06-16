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


def test_CsvScriptModel_insert_data_without_pandas():
    """Test that CSV script model works without pandas dependency"""
    model = CsvScriptModelFactory()
    model.args = ["echo", "id,name,value\n1,Alice,100\n2,Bob,200\n3,Charlie,300"]
    model.table_name = "test_table"
    output_dir = temp_folder()
    os.makedirs(output_dir, exist_ok=True)
    
    # This should work without pandas
    model.insert_csv_to_duckdb(output_dir)
    
    # Verify the data was inserted correctly
    source = model.get_duckdb_source(output_dir)
    result = source.read_sql(f"SELECT * FROM {model.table_name} ORDER BY id")
    
    assert result.shape == (3, 3)
    assert list(result.columns) == ["id", "name", "value"]
    assert result["id"].to_list() == [1, 2, 3]
    assert result["name"].to_list() == ["Alice", "Bob", "Charlie"] 
    assert result["value"].to_list() == [100, 200, 300]


def test_CsvScriptModel_handles_polars_dataframe_correctly():
    """Test that CSV script model properly handles polars DataFrame conversion"""
    model = CsvScriptModelFactory()
    model.args = ["echo", "x,y\n1,2\n3,4\n5,6"]
    model.table_name = "polars_test"
    output_dir = temp_folder()
    os.makedirs(output_dir, exist_ok=True)
    
    model.insert_csv_to_duckdb(output_dir)
    
    # Test that we can read the data back and it's in the correct format
    source = model.get_duckdb_source(output_dir)
    result = source.read_sql(f"SELECT SUM(x) as sum_x, SUM(y) as sum_y FROM {model.table_name}")
    
    assert result.shape == (1, 2)
    assert result["sum_x"].to_list() == [9]  # 1 + 3 + 5
    assert result["sum_y"].to_list() == [12]  # 2 + 4 + 6


def test_CsvScriptModel_bad_name():
    with pytest.raises(ValidationError) as exc_info:
        CsvScriptModelFactory(table_name="+++")

    error = exc_info.value.errors()[0]

    assert "String should match pattern" in error["msg"]
    assert error["type"] == "string_pattern_mismatch"
