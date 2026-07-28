"""Error message formatting for field resolution."""


def format_column_not_found_error(
    field_name: str,
    model_name: str,
    table: dict,
    is_quoted: bool = False,
) -> str:
    """Format a helpful error when a column is not found in schema.

    Args:
        field_name: The column name that wasn't found
        model_name: The model being queried
        table: Schema dict {column_name: type}
        is_quoted: Whether the field was quoted (affects messaging)

    Returns:
        Formatted error message with available columns
    """
    # An EMPTY schema means the model resolved no columns at all — reporting a
    # specific "column X not found" here is misleading (smoke-test bug #10: a
    # model whose `sql` references a nonexistent table yields an UNKNOWN/empty
    # schema, then this surfaces as "Column 'sex' not found" instead of naming
    # the real cause). Point at the likely causes instead.
    if not table:
        return (
            f"Column '{field_name}' not found on model '{model_name}' — the model "
            f"resolved no columns at all.\n"
            f"This usually means its `sql` references a table that does not exist "
            f"in the source (check the table name), or the model has not been run yet."
        )

    columns_table = format_available_columns(table)

    if is_quoted:
        return (
            f"Column '{field_name}' not found on model '{model_name}'.\n"
            f"(Exact case match required for quoted identifiers)\n\n"
            f"Available columns:\n{columns_table}"
        )

    return (
        f"Column '{field_name}' not found on model '{model_name}'.\n\n"
        f"Available columns:\n{columns_table}"
    )


def format_available_columns(table: dict) -> str:
    """Format available columns as a readable table.

    Args:
        table: Schema dict {column_name: type}

    Returns:
        Formatted table string
    """
    if not table:
        return "  (no columns available)"

    # Determine column widths
    max_name_len = max(len(col_name) for col_name in table.keys())
    max_name_len = max(max_name_len, len("Column Name"))
    name_width = min(max_name_len, 30)  # Cap at 30 chars

    lines = [
        f"  {'Column Name':<{name_width}} | Type",
        f"  {'-' * name_width}-|------------------",
    ]
    for col_name, col_type in sorted(table.items()):
        # Truncate long names
        display_name = col_name[:name_width] if len(col_name) > name_width else col_name
        lines.append(f"  {display_name:<{name_width}} | {col_type}")
    return "\n".join(lines)
