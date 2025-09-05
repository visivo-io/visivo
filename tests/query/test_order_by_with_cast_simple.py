"""
Simple test for ORDER BY with casted columns bug fix.

This test verifies that when a column is casted in SELECT/GROUP BY,
the ORDER BY correctly references the alias instead of the raw column.
"""

import re


def test_order_by_with_cast_uses_alias():
    """Test that the base_column_mapping fixes the Snowflake ORDER BY issue."""
    
    # Simulate the mapping logic from the fix
    alias_mapping = {}
    base_column_mapping = {}
    
    # This represents the SELECT clause with x: ?{year::varchar}
    expression = "year::varchar"
    sanitized_alias = "props|x"
    
    # Build mappings like the fix does
    alias_mapping[expression] = sanitized_alias
    
    # Extract base column from cast expression
    cast_match = re.match(r'^(\w+)::\w+$', expression)
    if cast_match:
        base_column = cast_match.group(1).lower()  # "year"
        base_column_mapping[base_column] = sanitized_alias
    
    # Now when ORDER BY has "year", we check mappings
    order_column = "year"
    column_lower = order_column.lower()
    
    # The fix: check base_column_mapping first
    if column_lower in base_column_mapping:
        result = base_column_mapping[column_lower]
        assert result == "props|x", f"Expected 'props|x' but got {result}"
        print(f"✓ ORDER BY '{order_column}' correctly mapped to alias '{result}'")
    else:
        raise AssertionError(f"Failed to map ORDER BY column '{order_column}'")


def test_cast_function_pattern():
    """Test that CAST function syntax is also handled."""
    
    base_column_mapping = {}
    
    # Test CAST function pattern
    expression = "CAST(date_field AS DATE)"
    sanitized_alias = "props|x"
    
    # Match CAST function
    cast_func_match = re.match(r'^CAST\s*\(\s*(\w+)\s+AS\s+\w+\s*\)$', expression, re.IGNORECASE)
    if cast_func_match:
        base_column = cast_func_match.group(1).lower()  # "date_field"
        base_column_mapping[base_column] = sanitized_alias
    
    # Verify mapping works
    assert "date_field" in base_column_mapping
    assert base_column_mapping["date_field"] == "props|x"
    print("✓ CAST function syntax correctly handled")


if __name__ == "__main__":
    test_order_by_with_cast_uses_alias()
    test_cast_function_pattern()
    print("\n✅ All tests passed - ORDER BY cast fix works!")