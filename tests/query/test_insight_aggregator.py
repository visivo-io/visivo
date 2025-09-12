import json
import os
import tempfile
from datetime import datetime, date
from decimal import Decimal

from visivo.query.insight_aggregator import InsightAggregator
from visivo.models.tokenized_insight import TokenizedInsight
import pytest


def test_flat_structure_generation_basic():
    """Test basic flat structure generation"""
    # Sample data
    data = [
        {"props.x": 1, "props.y": 10, "region": "North"},
        {"props.x": 2, "props.y": 20, "region": "North"},
        {"props.x": 3, "props.y": 15, "region": "South"},
        {"props.x": 4, "props.y": 25, "region": "South"},
    ]

    # Create minimal tokenized insight
    tokenized_insight = TokenizedInsight(
        name="test_insight",
        source="test_source",
        source_type="snowflake",
        pre_query="SELECT * FROM test",
        post_query="SELECT * FROM insight_data",
        select_items={"props.x": "x", "props.y": "y"},
        column_items={"region": "region"},
        interactions=[],
        input_dependencies=[],
        selects={},
        columns={},
        props={}
    )

    # Generate flat structure
    flat_data = InsightAggregator.generate_flat_structure(data, tokenized_insight)

    # Check structure
    assert "props.x" in flat_data
    assert "props.y" in flat_data
    assert "region" in flat_data

    # Check data
    assert flat_data["props.x"] == [1, 2, 3, 4]
    assert flat_data["props.y"] == [10, 20, 15, 25]
    assert flat_data["region"] == ["North", "North", "South", "South"]


def test_flat_structure_with_missing_values():
    """Test flat structure generation handles missing values correctly"""
    data = [
        {"props.x": 1, "props.y": 10, "region": "North"},
        {"props.x": 2, "region": "North"},  # Missing props.y
        {"props.y": 15, "region": "South"},  # Missing props.x
        {"props.x": 4, "props.y": 25},  # Missing region
    ]

    tokenized_insight = TokenizedInsight(
        name="test_insight",
        source="test_source",
        source_type="snowflake",
        pre_query="SELECT * FROM test",
        post_query="SELECT * FROM insight_data",
        select_items={},
        column_items={},
        interactions=[],
        input_dependencies=[],
        selects={},
        columns={},
        props={}
    )

    flat_data = InsightAggregator.generate_flat_structure(data, tokenized_insight)

    # Check that all columns are present
    assert "props.x" in flat_data
    assert "props.y" in flat_data
    assert "region" in flat_data

    # Check that missing values are filled with None
    assert flat_data["props.x"] == [1, 2, None, 4]
    assert flat_data["props.y"] == [10, None, 15, 25]
    assert flat_data["region"] == ["North", "North", "South", None]


def test_flat_structure_with_split_column():
    """Test that split column information is handled correctly"""
    data = [
        {"props.x": 1, "props.y": 10, "category": "A"},
        {"props.x": 2, "props.y": 20, "category": "B"},
    ]

    tokenized_insight = TokenizedInsight(
        name="test_insight",
        source="test_source",
        source_type="snowflake",
        pre_query="SELECT * FROM test",
        post_query="SELECT * FROM insight_data",
        select_items={},
        column_items={},
        interactions=[{"split": "category"}],
        input_dependencies=[],
        split_column="category",
        selects={},
        columns={},
        props={}
    )

    flat_data = InsightAggregator.generate_flat_structure(data, tokenized_insight)

    # Split column should be present in data
    assert "category" in flat_data
    assert flat_data["category"] == ["A", "B"]


def test_json_serializable_conversion():
    """Test that various data types are properly converted"""
    test_data = {
        "decimal_col": [Decimal("123.45"), Decimal("678.90")],
        "date_col": [date(2023, 1, 1), date(2023, 1, 2)],
        "datetime_col": [datetime(2023, 1, 1, 12, 0, 0), datetime(2023, 1, 2, 13, 0, 0)],
        "bytes_col": [b"hello", b"world"],
        "normal_col": [1, 2, 3],
    }

    result = InsightAggregator._make_json_serializable(test_data)

    # Check conversions
    assert result["decimal_col"] == [123.45, 678.90]
    assert result["date_col"] == ["2023-01-01", "2023-01-02"]
    assert result["datetime_col"] == ["2023-01-01T12:00:00", "2023-01-02T13:00:00"]
    assert isinstance(result["bytes_col"][0], str)  # Base64 encoded
    assert result["normal_col"] == [1, 2, 3]  # Unchanged


def test_column_name_normalization():
    """Test that column names are properly normalized"""
    data = [
        {"props|x": 1, "props|y": 10, "normal_col": "test"},
        {"props|x": 2, "props|y": 20, "normal_col": "test2"},
    ]

    normalized = InsightAggregator._normalize_column_names(data)

    # Check that | was replaced with .
    assert "props.x" in normalized[0]
    assert "props.y" in normalized[0]
    assert "normal_col" in normalized[0]
    assert "props|x" not in normalized[0]


def test_complete_insight_json_generation():
    """Test complete insight.json generation with all components"""
    data = [
        {"props.x": 1, "props.y": 10, "region": "North"},
        {"props.x": 2, "props.y": 20, "region": "South"},
    ]

    tokenized_insight = TokenizedInsight(
        name="revenue_insight",
        source="sales_db",
        source_type="snowflake",
        pre_query="SELECT x, y, region FROM sales",
        post_query="SELECT * FROM insight_data WHERE region = '${ref(region_select).value}'",
        select_items={"props.x": "date", "props.y": "sum(amount)"},
        column_items={"region": "region"},
        interactions=[{"filter": "region = '${ref(region_select).value}'"}],
        input_dependencies=["region_select"],
        split_column="region",
        selects={},
        columns={},
        props={}
    )

    flat_data = InsightAggregator.generate_flat_structure(data, tokenized_insight)
    insight_json = InsightAggregator.generate_insight_json(flat_data, tokenized_insight)

    # Check main structure
    assert "data" in insight_json
    assert "pre_query" in insight_json
    assert "post_query" in insight_json
    assert "interactions" in insight_json
    assert "metadata" in insight_json

    # Check data
    assert insight_json["data"]["props.x"] == [1, 2]
    assert insight_json["data"]["props.y"] == [10, 20]
    assert insight_json["data"]["region"] == ["North", "South"]

    # Check metadata
    metadata = insight_json["metadata"]
    assert metadata["name"] == "revenue_insight"
    assert metadata["source"] == "sales_db"
    assert metadata["split_column"] == "region"
    assert "region_select" in metadata["input_dependencies"]


def test_aggregate_insight_data_file_creation():
    """Test that aggregate_insight_data creates proper file structure"""
    data = [{"props.x": 1, "props.y": 10}, {"props.x": 2, "props.y": 20}]

    tokenized_insight = TokenizedInsight(
        name="test_insight",
        source="test_source",
        source_type="sqlite",
        pre_query="SELECT * FROM test",
        post_query="SELECT * FROM insight_data",
        select_items={"props.x": "x", "props.y": "y"},
        column_items={},
        interactions=[],
        input_dependencies=[],
        selects={},
        columns={},
        props={}
    )

    # Use temporary directory
    with tempfile.TemporaryDirectory() as temp_dir:
        insight_dir = os.path.join(temp_dir, "test_insight")

        # Aggregate data
        InsightAggregator.aggregate_insight_data(data, insight_dir, tokenized_insight)

        # Check file was created
        insight_file = os.path.join(insight_dir, "insight.json")
        assert os.path.exists(insight_file)

        # Check file contents
        with open(insight_file, "r") as f:
            result = json.load(f)

        assert "data" in result
        assert "pre_query" in result
        assert "post_query" in result
        assert "metadata" in result
        # assert result["data"]["props.x"] == [1, 2]
        # assert result["data"]["props.y"] == [10, 20]


def test_flat_data_summary():
    """Test flat data summary generation"""
    flat_data = {
        "props.x": [1, 2, 3, None],
        "props.y": [10.5, 20.5, None, 40.5],
        "region": ["North", "South", "East", "West"],
    }

    summary = InsightAggregator.get_flat_data_summary(flat_data)

    # Check summary structure
    assert summary["rows"] == 4
    assert summary["columns"] == 3
    assert "column_info" in summary

    # Check column info
    x_info = summary["column_info"]["props.x"]
    assert x_info["length"] == 4
    assert x_info["non_null_count"] == 3
    assert x_info["null_count"] == 1

    y_info = summary["column_info"]["props.y"]
    assert y_info["non_null_count"] == 3
    assert y_info["data_type"] == "float"

    region_info = summary["column_info"]["region"]
    assert region_info["non_null_count"] == 4
    assert region_info["data_type"] == "str"


def test_empty_data_handling():
    """Test that empty data is handled gracefully"""
    data = []

    tokenized_insight = TokenizedInsight(
        name="empty_insight",
        source="test_source",
        source_type="sqlite",
        pre_query="SELECT * FROM empty_table",
        post_query="SELECT * FROM insight_data",
        select_items={},
        column_items={},
        interactions=[],
        input_dependencies=[],
        selects={},
        columns={},
        props={}
    )

    flat_data = InsightAggregator.generate_flat_structure(data, tokenized_insight)
    assert flat_data == {}

    insight_json = InsightAggregator.generate_insight_json(flat_data, tokenized_insight)
    assert insight_json["data"] == {}
    assert "pre_query" in insight_json
    assert "post_query" in insight_json
    assert "metadata" in insight_json


def test_large_dataset_handling():
    """Test handling of larger datasets"""
    # Generate 1000 rows of test data
    data = []
    for i in range(1000):
        data.append(
            {
                "props.x": i,
                "props.y": i * 2,
                "region": "North" if i % 2 == 0 else "South",
                "value": float(i) * 1.5,
            }
        )

    tokenized_insight = TokenizedInsight(
        name="large_insight",
        source="test_source",
        source_type="postgres",
        pre_query="SELECT * FROM large_table",
        post_query="SELECT * FROM insight_data",
        select_items={},
        column_items={},
        interactions=[],
        input_dependencies=[],
        selects={},
        columns={},
        props={}
    )

    flat_data = InsightAggregator.generate_flat_structure(data, tokenized_insight)

    # Check data integrity
    assert len(flat_data["props.x"]) == 1000
    assert flat_data["props.x"][0] == 0
    assert flat_data["props.x"][999] == 999
    assert flat_data["region"][0] == "North"
    assert flat_data["region"][1] == "South"


def test_special_characters_in_column_names():
    """Test handling of special characters in column names"""
    data = [
        {
            "props.x-axis": 1,
            "props.y axis": 10,
            "props.marker$color": "red",
            "user@domain.com": "test",
            "column with spaces": "value1",
        },
        {
            "props.x-axis": 2,
            "props.y axis": 20,
            "props.marker$color": "blue",
            "user@domain.com": "test2",
            "column with spaces": "value2",
        },
    ]

    tokenized_insight = TokenizedInsight(
        name="special_chars_insight",
        source="test_source",
        source_type="mysql",
        pre_query="SELECT * FROM test",
        post_query="SELECT * FROM insight_data",
        select_items={},
        column_items={},
        interactions=[],
        input_dependencies=[],
        selects={},
        columns={},
        props={}
    )

    flat_data = InsightAggregator.generate_flat_structure(data, tokenized_insight)

    # All columns should be preserved
    assert "props.x-axis" in flat_data
    assert "props.y axis" in flat_data
    assert "props.marker$color" in flat_data
    assert "user@domain.com" in flat_data
    assert "column with spaces" in flat_data

    assert flat_data["props.x-axis"] == [1, 2]
    assert flat_data["props.marker$color"] == ["red", "blue"]


def test_mixed_data_types_in_columns():
    """Test handling of mixed data types within the same column"""
    data = [
        {"mixed_col": 123, "number_col": 1.5},
        {"mixed_col": "string", "number_col": 2.5},
        {"mixed_col": None, "number_col": None},
        {"mixed_col": True, "number_col": 3.0},
    ]

    tokenized_insight = TokenizedInsight(
        name="mixed_types_insight",
        source="test_source",
        source_type="duckdb",
        pre_query="SELECT * FROM test",
        post_query="SELECT * FROM insight_data",
        select_items={},
        column_items={},
        interactions=[],
        input_dependencies=[],
        selects={},
        columns={},
        props={}
    )

    flat_data = InsightAggregator.generate_flat_structure(data, tokenized_insight)

    # Mixed types should be preserved as-is
    assert flat_data["mixed_col"] == [123, "string", None, True]
    assert flat_data["number_col"] == [1.5, 2.5, None, 3.0]


def test_very_long_column_names():
    """Test handling of very long column names"""
    long_column_name = "very_" + "long_" * 50 + "column_name"

    data = [{long_column_name: "value1", "short": 1}, {long_column_name: "value2", "short": 2}]

    tokenized_insight = TokenizedInsight(
        name="long_names_insight",
        source="test_source",
        source_type="bigquery",
        pre_query="SELECT * FROM test",
        post_query="SELECT * FROM insight_data",
        select_items={},
        column_items={},
        interactions=[],
        input_dependencies=[],
        selects={},
        columns={},
        props={}
    )

    flat_data = InsightAggregator.generate_flat_structure(data, tokenized_insight)

    # Long column name should be preserved
    assert long_column_name in flat_data
    assert flat_data[long_column_name] == ["value1", "value2"]
    assert flat_data["short"] == [1, 2]


def test_unicode_data_handling():
    """Test handling of Unicode characters in data"""
    data = [
        {"name": "José María", "emoji": "🎉", "chinese": "你好"},
        {"name": "François", "emoji": "🚀", "chinese": "世界"},
        {"name": "Müller", "emoji": "⭐", "chinese": "测试"},
    ]

    tokenized_insight = TokenizedInsight(
        name="unicode_insight",
        source="test_source",
        source_type="postgres",
        pre_query="SELECT * FROM test",
        post_query="SELECT * FROM insight_data",
        select_items={},
        column_items={},
        interactions=[],
        input_dependencies=[],
        selects={},
        columns={},
        props={}
    )

    flat_data = InsightAggregator.generate_flat_structure(data, tokenized_insight)

    # Unicode should be preserved
    assert flat_data["name"] == ["José María", "François", "Müller"]
    assert flat_data["emoji"] == ["🎉", "🚀", "⭐"]
    assert flat_data["chinese"] == ["你好", "世界", "测试"]


def test_nested_dict_serialization():
    """Test serialization of nested dictionaries and complex objects"""
    from datetime import time

    complex_data = {
        "nested": {"level1": {"level2": "deep_value"}},
        "list_of_dicts": [{"a": 1}, {"b": 2}],
        "time_obj": time(14, 30, 0),
        "mixed_list": [1, "string", {"key": "value"}, None],
    }

    result = InsightAggregator._make_json_serializable(complex_data)

    # Check nested structures are preserved
    assert result["nested"]["level1"]["level2"] == "deep_value"
    assert result["list_of_dicts"] == [{"a": 1}, {"b": 2}]
    assert result["time_obj"] == "14:30:00"
    assert result["mixed_list"] == [1, "string", {"key": "value"}, None]
