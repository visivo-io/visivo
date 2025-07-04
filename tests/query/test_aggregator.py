import os
import json
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

    input_path = temp_file("simple_input.json", simple_input, output_dir=output_dir)
    Aggregator.aggregate(str(input_path), output_dir)

    with open(f"{output_dir}/data.json") as f:
        result = json.load(f)

    assert result == expected_output
