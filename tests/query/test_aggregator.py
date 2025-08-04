import os
import json
import polars as pl
from decimal import Decimal
from datetime import datetime, date, time
from visivo.query.aggregator import Aggregator
from tests.support.utils import temp_folder, temp_file

# Sample input and expected output (from attached files)
POLARS_INPUT = """[
    {
        "cohort_on": "Sep 2023",
        "columns.x_data": ["Revenues", "Other Revenues", "Total Revenues", "Cost Of Revenues", "Gross Profit", "Selling General & Admin Expenses", "R&D Expenses", "Total Operating Expenses", "Operating Income", "Interest Expense", "Interest And Investment Income", "Net Interest Expenses", "Other Non Operating Income (Expenses)", "EBT, Incl. Unusual Items", "Income Tax Expense", "Net Income"],
        "columns.y_data": [383285.0, null, 383285.0, -214137.0, 169148.0, -24932.0, -29915.0, -54847.0, 114301.0, -3933.0, 3750.0, -183.0, -382.0, 113736.0, -16741.0, 96995.0],
        "columns.measure": ["relative", "relative", "total", "relative", "total", "relative", "relative", "relative", "total", "relative", "relative", "relative", "relative", "total", "relative ", "total"],
        "props.text": ["383,285.00", "-", "383,285.00", "214,137.00", "169,148.00", "24,932.00", "29,915.00", "54,847.00", "114,301.00", "-3,933.00", "3,750.00", "-183", "-382", "113,736.00", "16,741.00", "96,995.00"]
    },
    {
        "cohort_on": "Sep 2022",
        "columns.x_data": ["Revenues", "Other Revenues", "Total Revenues", "Cost Of Revenues", "Gross Profit", "Selling General & Admin Expenses", "R&D Expenses", "Total Operating Expenses", "Operating Income", "Interest Expense", "Interest And Investment Income", "Net Interest Expenses", "Other Non Operating Income (Expenses)", "EBT, Incl. Unusual Items", "Income Tax Expense", "Net Income"],
        "columns.y_data": [394328.0, null, 394328.0, -223546.0, 170782.0, -25094.0, -26251.0, -51345.0, 119437.0, -2931.0, 2825.0, -106.0, -228.0, 119103.0, -19300.0, 99803.0],
        "columns.measure": ["relative", "relative", "total", "relative", "total", "relative", "relative", "relative", "total", "relative", "relative", "relative", "relative", "total", "relative ", "total"],
        "props.text": ["394,328.00", "-", "394,328.00", "223,546.00", "170,782.00", "25,094.00", "26,251.00", "51,345.00", "119,437.00", "-2,931.00", "2,825.00", "-106", "-228", "119,103.00", "19,300.00", "99,803.00"]
    }
]"""

PANDAS_OUTPUT = {
    "Sep 2022": {
        "columns.x_data": [
            "Revenues",
            "Other Revenues",
            "Total Revenues",
            "Cost Of Revenues",
            "Gross Profit",
            "Selling General & Admin Expenses",
            "R&D Expenses",
            "Total Operating Expenses",
            "Operating Income",
            "Interest Expense",
            "Interest And Investment Income",
            "Net Interest Expenses",
            "Other Non Operating Income (Expenses)",
            "EBT, Incl. Unusual Items",
            "Income Tax Expense",
            "Net Income",
        ],
        "columns.y_data": [
            394328.0,
            None,
            394328.0,
            -223546.0,
            170782.0,
            -25094.0,
            -26251.0,
            -51345.0,
            119437.0,
            -2931.0,
            2825.0,
            -106.0,
            -228.0,
            119103.0,
            -19300.0,
            99803.0,
        ],
        "columns.measure": [
            "relative",
            "relative",
            "total",
            "relative",
            "total",
            "relative",
            "relative",
            "relative",
            "total",
            "relative",
            "relative",
            "relative",
            "relative",
            "total",
            "relative ",
            "total",
        ],
        "props.text": [
            "394,328.00",
            "-",
            "394,328.00",
            "223,546.00",
            "170,782.00",
            "25,094.00",
            "26,251.00",
            "51,345.00",
            "119,437.00",
            "-2,931.00",
            "2,825.00",
            "-106",
            "-228",
            "119,103.00",
            "19,300.00",
            "99,803.00",
        ],
    },
    "Sep 2023": {
        "columns.x_data": [
            "Revenues",
            "Other Revenues",
            "Total Revenues",
            "Cost Of Revenues",
            "Gross Profit",
            "Selling General & Admin Expenses",
            "R&D Expenses",
            "Total Operating Expenses",
            "Operating Income",
            "Interest Expense",
            "Interest And Investment Income",
            "Net Interest Expenses",
            "Other Non Operating Income (Expenses)",
            "EBT, Incl. Unusual Items",
            "Income Tax Expense",
            "Net Income",
        ],
        "columns.y_data": [
            383285.0,
            None,
            383285.0,
            -214137.0,
            169148.0,
            -24932.0,
            -29915.0,
            -54847.0,
            114301.0,
            -3933.0,
            3750.0,
            -183.0,
            -382.0,
            113736.0,
            -16741.0,
            96995.0,
        ],
        "columns.measure": [
            "relative",
            "relative",
            "total",
            "relative",
            "total",
            "relative",
            "relative",
            "relative",
            "total",
            "relative",
            "relative",
            "relative",
            "relative",
            "total",
            "relative ",
            "total",
        ],
        "props.text": [
            "383,285.00",
            "-",
            "383,285.00",
            "214,137.00",
            "169,148.00",
            "24,932.00",
            "29,915.00",
            "54,847.00",
            "114,301.00",
            "-3,933.00",
            "3,750.00",
            "-183",
            "-382",
            "113,736.00",
            "16,741.00",
            "96,995.00",
        ],
    },
}


def test_polars_aggregator_matches_pandas():
    output_dir = temp_folder()
    input_path = temp_file("input.json", POLARS_INPUT, output_dir=output_dir)
    Aggregator.aggregate(str(input_path), output_dir)
    with open(f"{output_dir}/data.json") as f:
        result = json.load(f)
    assert result == PANDAS_OUTPUT


def test_json_aggregation_basic():
    """Test basic JSON aggregation functionality with simple data"""
    output_dir = temp_folder()

    # Simple test data with two cohorts
    simple_input = """[
        {
            "cohort_on": "2023-Q1",
            "columns.x_data": ["A", "B"],
            "columns.y_data": [10, 20],
            "props.text": ["10", "20"]
        },
        {
            "cohort_on": "2023-Q1", 
            "columns.x_data": ["A", "B"],
            "columns.y_data": [15, 25],
            "props.text": ["15", "25"]
        },
        {
            "cohort_on": "2023-Q2",
            "columns.x_data": ["A", "B"],
            "columns.y_data": [30, 40],
            "props.text": ["30", "40"]
        }
    ]"""

    expected_output = {
        "columns.x_data": [["A", "B"], ["A", "B"], ["A", "B"]],
        "columns.y_data": [[10, 20], [15, 25], [30, 40]],
        "props.text": [["10", "20"], ["15", "25"], ["30", "40"]],
    }

    input_path = temp_file("simple_input.json", simple_input, output_dir=output_dir)
    Aggregator.aggregate(str(input_path), output_dir)

    with open(f"{output_dir}/data.json") as f:
        result = json.load(f)

    assert result == expected_output


def test_python_aggregation_with_binary_data():
    """
    Test that the new pure Python aggregation handles all data types correctly,
    including binary data that would cause issues with Polars.
    """

    output_dir = temp_folder()

    # Create raw data (simulating what read_sql would return)
    raw_data = [
        {
            "cohort_on": "test_cohort",
            "binary_data": b"\x12\x34\x56\x78\x9a\xbc\xde\xf0",  # 8-byte binary data
            "text_data": "value1",
            "numeric_data": 42,
        },
        {
            "cohort_on": "test_cohort",  # Same cohort to trigger aggregation
            "binary_data": b"\xaa\xbb\xcc\xdd\xee\xff\x00\x11",  # Different 8-byte binary data
            "text_data": "value2",
            "numeric_data": 84,
        },
    ]

    # This should work with the pure Python implementation
    Aggregator.aggregate_data_frame(raw_data, output_dir)

    # Verify the output was created successfully
    output_file = os.path.join(output_dir, "data.json")
    assert os.path.exists(output_file), "Output file should be created"

    # Verify we can read and parse the JSON
    with open(output_file, "r") as f:
        result = json.load(f)

    # Verify the structure is correct
    assert "test_cohort" in result, "Should have the test cohort"
    assert "binary_data" in result["test_cohort"], "Should have binary_data column"
    assert "text_data" in result["test_cohort"], "Should have text_data column"
    assert "numeric_data" in result["test_cohort"], "Should have numeric_data column"

    # Verify the data was aggregated into lists (flat structure, no cohorts)
    
    # Text data should be aggregated into a list
    assert isinstance(result["text_data"], list), "text_data should be aggregated into a list"
    assert len(result["text_data"]) == 2, "Should have 2 text values"
    assert result["text_data"] == ["value1", "value2"], "Text values should be correct"

    # Numeric data should be aggregated into a list
    assert isinstance(
        result["numeric_data"], list
    ), "numeric_data should be aggregated into a list"
    assert len(result["numeric_data"]) == 2, "Should have 2 numeric values"
    assert result["numeric_data"] == [42, 84], "Numeric values should be correct"

    # Binary data should be converted to base64 strings for JSON serialization
    assert isinstance(
        result["binary_data"], list
    ), "binary_data should be aggregated into a list"
    assert len(result["binary_data"]) == 2, "Should have 2 binary values"

    # Verify the binary data was converted to base64 strings
    import base64

    expected_binary_1 = base64.b64encode(b"\x12\x34\x56\x78\x9a\xbc\xde\xf0").decode("utf-8")
    expected_binary_2 = base64.b64encode(b"\xaa\xbb\xcc\xdd\xee\xff\x00\x11").decode("utf-8")

    assert (
        result["binary_data"][0] == expected_binary_1
    ), "First binary value should be base64 encoded"
    assert (
        result["binary_data"][1] == expected_binary_2
    ), "Second binary value should be base64 encoded"


def test_pure_python_aggregation_compatibility():
    """
    Test that the pure Python aggregation produces the same results as the original Polars version
    for normal data (ensuring we maintain backward compatibility).
    """

    output_dir = temp_folder()

    # Use the same test data as the original test
    test_data = [
        {
            "cohort_on": "2023-Q1",
            "columns.x_data": ["A", "B"],
            "columns.y_data": [10, 20],
            "props.text": ["10", "20"],
        },
        {
            "cohort_on": "2023-Q1",
            "columns.x_data": ["A", "B"],
            "columns.y_data": [15, 25],
            "props.text": ["15", "25"],
        },
        {
            "cohort_on": "2023-Q2",
            "columns.x_data": ["A", "B"],
            "columns.y_data": [30, 40],
            "props.text": ["30", "40"],
        },
    ]

    expected_output = {
        "2023-Q1": {
            "columns.x_data": [["A", "B"], ["A", "B"]],
            "columns.y_data": [[10, 20], [15, 25]],
            "props.text": [["10", "20"], ["15", "25"]],
        },
        "2023-Q2": {
            "columns.x_data": ["A", "B"],
            "columns.y_data": [30, 40],
            "props.text": ["30", "40"],
        },
    }

    # Test with direct data
    Aggregator.aggregate_data(test_data, output_dir)

    # Verify output
    output_file = os.path.join(output_dir, "data.json")
    with open(output_file, "r") as f:
        result = json.load(f)

    assert result == expected_output, f"Expected {expected_output}, got {result}"


def test_decimal_data_handling():
    """
    Test that Decimal objects from database queries are properly converted to JSON-serializable format.
    """
    output_dir = temp_folder()

    # Create test data with Decimal values (common in financial/database data)
    test_data = [
        {
            "cohort_on": "financial_data",
            "price": Decimal("123.45"),
            "quantity": Decimal("10.5"),
            "total": Decimal("1296.225"),
        },
        {
            "cohort_on": "financial_data",
            "price": Decimal("67.89"),
            "quantity": Decimal("5.25"),
            "total": Decimal("356.4225"),
        },
    ]

    # This should work without throwing JSON serialization errors
    Aggregator.aggregate_data(test_data, output_dir)

    # Verify the output was created successfully
    output_file = os.path.join(output_dir, "data.json")
    assert os.path.exists(output_file), "Output file should be created"

    # Verify we can read and parse the JSON
    with open(output_file, "r") as f:
        result = json.load(f)

    # Verify the structure is correct
    assert "financial_data" in result, "Should have the financial_data cohort"
    cohort_data = result["financial_data"]

    # Verify Decimal values were converted to floats and aggregated properly
    assert isinstance(cohort_data["price"], list), "price should be aggregated into a list"
    assert len(cohort_data["price"]) == 2, "Should have 2 price values"
    assert cohort_data["price"] == [123.45, 67.89], "Price values should be converted to float"

    assert isinstance(cohort_data["quantity"], list), "quantity should be aggregated into a list"
    assert len(cohort_data["quantity"]) == 2, "Should have 2 quantity values"
    assert cohort_data["quantity"] == [10.5, 5.25], "Quantity values should be converted to float"

    assert isinstance(cohort_data["total"], list), "total should be aggregated into a list"
    assert len(cohort_data["total"]) == 2, "Should have 2 total values"
    assert cohort_data["total"] == [1296.225, 356.4225], "Total values should be converted to float"


def test_datetime_data_handling():
    """
    Test that datetime, date, and time objects from database queries are properly converted to JSON-serializable format.
    """
    output_dir = temp_folder()

    # Create test data with datetime types (common in database data)
    test_datetime = datetime(2023, 12, 25, 15, 30, 45)
    test_date = date(2023, 12, 25)
    test_time = time(15, 30, 45)

    test_data = [
        {
            "cohort_on": "temporal_data",
            "created_at": test_datetime,
            "event_date": test_date,
            "event_time": test_time,
        },
        {
            "cohort_on": "temporal_data",
            "created_at": datetime(2023, 12, 26, 10, 15, 30),
            "event_date": date(2023, 12, 26),
            "event_time": time(10, 15, 30),
        },
    ]

    # This should work without throwing JSON serialization errors
    Aggregator.aggregate_data(test_data, output_dir)

    # Verify the output was created successfully
    output_file = os.path.join(output_dir, "data.json")
    assert os.path.exists(output_file), "Output file should be created"

    # Verify we can read and parse the JSON
    with open(output_file, "r") as f:
        result = json.load(f)

    # Verify the structure is correct
    assert "temporal_data" in result, "Should have the temporal_data cohort"
    cohort_data = result["temporal_data"]

    # Verify datetime values were converted to ISO strings and aggregated properly
    assert isinstance(
        cohort_data["created_at"], list
    ), "created_at should be aggregated into a list"
    assert len(cohort_data["created_at"]) == 2, "Should have 2 created_at values"
    assert cohort_data["created_at"] == [
        "2023-12-25T15:30:45",
        "2023-12-26T10:15:30",
    ], "Datetime values should be ISO strings"

    assert isinstance(
        cohort_data["event_date"], list
    ), "event_date should be aggregated into a list"
    assert len(cohort_data["event_date"]) == 2, "Should have 2 event_date values"
    assert cohort_data["event_date"] == [
        "2023-12-25",
        "2023-12-26",
    ], "Date values should be ISO strings"

    assert isinstance(
        cohort_data["event_time"], list
    ), "event_time should be aggregated into a list"
    assert len(cohort_data["event_time"]) == 2, "Should have 2 event_time values"
    assert cohort_data["event_time"] == [
        "15:30:45",
        "10:15:30",
    ], "Time values should be ISO strings"
