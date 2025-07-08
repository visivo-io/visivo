#!/usr/bin/env python3
"""
Quick test to verify the aggregator works correctly before running the full test suite.
"""

import sys
import os
import tempfile
import json

# Add the project to path
sys.path.insert(0, '/Users/tgsoverly/code/visivo')

from visivo.query.aggregator import Aggregator

def test_basic_aggregation():
    """Test basic aggregation functionality"""
    
    # Test data from the original test
    test_data = [
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
    
    with tempfile.TemporaryDirectory() as temp_dir:
        try:
            Aggregator.aggregate_data(test_data, temp_dir)
            
            output_file = os.path.join(temp_dir, "data.json")
            with open(output_file, 'r') as f:
                result = json.load(f)
            
            print("Expected:", expected_output)
            print("Got:     ", result)
            
            if result == expected_output:
                print("✅ Basic aggregation test PASSED")
                return True
            else:
                print("❌ Basic aggregation test FAILED")
                return False
                
        except Exception as e:
            print(f"❌ Basic aggregation test FAILED with error: {e}")
            return False

if __name__ == "__main__":
    print("Testing aggregator functionality...")
    success = test_basic_aggregation()
    
    if success:
        print("\n🎉 Quick test passed! The aggregator should work correctly.")
        print("You can now run 'poetry run pytest' with confidence.")
    else:
        print("\n⚠️ Quick test failed. Please check the implementation.")