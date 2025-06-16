from visivo.models.sources.duckdb_source import DuckdbSource
import pytest
from pydantic import ValidationError
import os
import tempfile
import polars as pl


def test_DuckdbSource_simple_data():
    data = {"name": "source", "database": "database", "type": "duckdb"}
    source = DuckdbSource(**data)
    assert source.name == "source"


def test_DuckdbSource_missing_data():
    with pytest.raises(ValidationError) as exc_info:
        DuckdbSource()

    error = exc_info.value.errors()[0]

    assert error["msg"] == "Field required"
    assert error["type"] == "missing"


def test_DuckdbSource_read_sql_without_pandas():
    """Test that DuckDB read_sql works without pandas dependency"""
    with tempfile.NamedTemporaryFile(suffix=".duckdb", delete=False) as temp_db:
        try:
            source = DuckdbSource(
                name="test_source",
                database=temp_db.name,
                type="duckdb"
            )
            
            # Create a test table and insert some data
            with source.connect() as connection:
                connection.execute("CREATE TABLE test_table (id INTEGER, name VARCHAR)")
                connection.execute("INSERT INTO test_table VALUES (1, 'Alice'), (2, 'Bob'), (3, 'Charlie')")
            
            # Test read_sql returns a polars DataFrame
            result = source.read_sql("SELECT * FROM test_table ORDER BY id")
            
            assert isinstance(result, pl.DataFrame)
            assert result.shape == (3, 2)
            assert list(result.columns) == ["id", "name"]
            assert result["id"].to_list() == [1, 2, 3]
            assert result["name"].to_list() == ["Alice", "Bob", "Charlie"]
            
        finally:
            os.unlink(temp_db.name)


def test_DuckdbSource_read_sql_error_handling():
    """Test that DuckDB read_sql properly handles SQL errors"""
    with tempfile.NamedTemporaryFile(suffix=".duckdb", delete=False) as temp_db:
        try:
            source = DuckdbSource(
                name="test_source",
                database=temp_db.name,
                type="duckdb"
            )
            
            with pytest.raises(Exception) as exc_info:
                source.read_sql("SELECT * FROM non_existent_table")
            
            assert "Error executing query on source 'test_source'" in str(exc_info.value)
            
        finally:
            os.unlink(temp_db.name)


def test_DuckdbSource_connection_handling():
    """Test that DuckDB connections are properly managed"""
    with tempfile.NamedTemporaryFile(suffix=".duckdb", delete=False) as temp_db:
        try:
            source = DuckdbSource(
                name="test_source",
                database=temp_db.name,
                type="duckdb"
            )
            
            # Test that context manager works properly
            with source.connect() as connection:
                result = connection.execute("SELECT 1 as test_col")
                assert result.fetchone() == (1,)
            
            # Test that connection is closed after context manager
            # This should work fine if connections are managed properly
            with source.connect() as connection:
                result = connection.execute("SELECT 2 as test_col")
                assert result.fetchone() == (2,)
                
        finally:
            os.unlink(temp_db.name)
