import json
import pytest
from visivo.query.aggregator import Aggregator
from tests.support.utils import temp_folder, temp_file


def test_new_flat_aggregator_structure():
    """Test that the new aggregator outputs flat data structure without cohort grouping"""
    output_dir = temp_folder()

    # Test data with cohort_on values that should be ignored in output
    test_input = """[
        {
            "cohort_on": "Product A",
            "columns.x_data": ["Jan", "Feb"],
            "columns.y_data": [100, 150],
            "props.text": ["100", "150"]
        },
        {
            "cohort_on": "Product B", 
            "columns.x_data": ["Jan", "Feb"],
            "columns.y_data": [200, 250],
            "props.text": ["200", "250"]
        }
    ]"""

    # Expected flat output structure (no cohort_on field, no grouping)
    expected_output = {
        "columns.x_data": [["Jan", "Feb"], ["Jan", "Feb"]],
        "columns.y_data": [[100, 150], [200, 250]],
        "props.text": [["100", "150"], ["200", "250"]]
    }

    input_path = temp_file("test_input.json", test_input, output_dir=output_dir)
    Aggregator.aggregate(str(input_path), output_dir)

    with open(f"{output_dir}/data.json") as f:
        result = json.load(f)

    # Verify flat structure with no cohort_on field
    assert result == expected_output
    assert "cohort_on" not in result, "cohort_on should not appear in output data"


def test_aggregator_with_mixed_data_types():
    """Test that the aggregator handles different data types correctly in flat structure"""
    output_dir = temp_folder()

    test_input = """[
        {
            "cohort_on": "group1",
            "text_col": "value1",
            "number_col": 42,
            "array_col": [1, 2, 3],
            "null_col": null
        },
        {
            "cohort_on": "group2",
            "text_col": "value2", 
            "number_col": 84,
            "array_col": [4, 5, 6],
            "null_col": "not_null"
        }
    ]"""

    expected_output = {
        "text_col": ["value1", "value2"],
        "number_col": [42, 84],
        "array_col": [[1, 2, 3], [4, 5, 6]],
        "null_col": [None, "not_null"]
    }

    input_path = temp_file("mixed_data.json", test_input, output_dir=output_dir)
    Aggregator.aggregate(str(input_path), output_dir)

    with open(f"{output_dir}/data.json") as f:
        result = json.load(f)

    assert result == expected_output
    assert "cohort_on" not in result


def test_aggregator_empty_data():
    """Test aggregator behavior with empty input"""
    output_dir = temp_folder()
    
    test_input = "[]"
    
    input_path = temp_file("empty.json", test_input, output_dir=output_dir)
    Aggregator.aggregate(str(input_path), output_dir)
    
    with open(f"{output_dir}/data.json") as f:
        result = json.load(f)
    
    assert result == {}


def test_aggregator_single_row():
    """Test aggregator with single row of data"""
    output_dir = temp_folder()

    test_input = """[
        {
            "cohort_on": "single",
            "columns.x": ["A", "B", "C"],
            "columns.y": [10, 20, 30]
        }
    ]"""

    expected_output = {
        "columns.x": ["A", "B", "C"], 
        "columns.y": [10, 20, 30]
    }

    input_path = temp_file("single_row.json", test_input, output_dir=output_dir)
    Aggregator.aggregate(str(input_path), output_dir)

    with open(f"{output_dir}/data.json") as f:
        result = json.load(f)

    assert result == expected_output
    assert "cohort_on" not in result