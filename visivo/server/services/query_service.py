"""Query execution service for running SQL queries against sources."""

import time
from typing import Dict, Any, Optional
from visivo.logger.logger import Logger
from visivo.models.project import Project


# Maximum number of rows to return from a query (will truncate if exceeded)
MAX_ROWS = 100000


def parse_sql_error(error: Exception, query: str) -> str:
    """
    Parse SQL errors to provide more helpful error messages.

    Args:
        error: The exception that was raised
        query: The SQL query that caused the error

    Returns:
        A formatted, user-friendly error message
    """
    error_str = str(error)

    # Try to extract line/column information from common database error formats
    # PostgreSQL format: "ERROR:  syntax error at or near "FROM" LINE 2: FROM users"
    # MySQL format: "... near 'FROM users' at line 2"
    # DuckDB format: "Parser Error: syntax error at or near "FROM""

    import re

    # Try to find line numbers
    line_match = re.search(r"line\s+(\d+)", error_str, re.IGNORECASE)
    col_match = re.search(r"column\s+(\d+)", error_str, re.IGNORECASE)

    formatted_error = f"Query execution failed: {error_str}"

    if line_match:
        line_num = int(line_match.group(1))
        formatted_error += f"\n\nError location: Line {line_num}"

        # Show the problematic line from the query
        query_lines = query.split("\n")
        if 0 < line_num <= len(query_lines):
            formatted_error += f"\n>>> {query_lines[line_num - 1].strip()}"
            if col_match:
                col_num = int(col_match.group(1))
                formatted_error += f"\n    {' ' * (col_num - 1)}^"

    # Add helpful hints based on error type
    error_lower = error_str.lower()
    if "syntax error" in error_lower:
        formatted_error += "\n\nHint: Check your SQL syntax. Common issues include missing commas, unclosed quotes, or typos in keywords."
    elif "does not exist" in error_lower or "not found" in error_lower:
        formatted_error += "\n\nHint: The referenced table or column may not exist. Check your schema or use the Sources tab to explore available tables."
    elif "ambiguous" in error_lower:
        formatted_error += "\n\nHint: Column name is ambiguous. Try using table aliases or fully qualified column names (table.column)."
    elif "permission denied" in error_lower or "access denied" in error_lower:
        formatted_error += "\n\nHint: You may not have permission to access this resource. Check your database credentials."

    return formatted_error


def execute_query_on_source(
    query: str, source_name: Optional[str], project: Project
) -> Dict[str, Any]:
    """
    Execute a SQL query on a specified source.

    Args:
        query: The SQL query to execute
        source_name: Optional name of the source to use. If None, uses default source.
        project: The Visivo project containing source configurations

    Returns:
        Dictionary containing:
        - columns: List of column names
        - rows: List of row dictionaries
        - is_truncated: Boolean indicating if results were truncated at MAX_ROWS
        - execution_time: Query execution time in seconds

    Raises:
        ValueError: If no source is available or query execution fails
    """
    # Get the appropriate source
    source = None
    if source_name:
        source = next((s for s in project.sources if s.name == source_name), None)

    if not source and project.defaults and project.defaults.source_name:
        source = next(
            (s for s in project.sources if s.name == project.defaults.source_name),
            None,
        )

    if not source and project.sources:
        source = project.sources[0]

    if not source:
        raise ValueError("No source configured")

    Logger.instance().info(f"Executing query with source: {source.name}")

    # Execute the query and measure execution time
    start_time = time.time()
    try:
        result = source.read_sql(query)
    except Exception as e:
        # Parse and enhance the error message
        enhanced_error = parse_sql_error(e, query)
        raise ValueError(enhanced_error) from e
    execution_time = round(time.time() - start_time, 3)

    # Check if we need to truncate results
    is_truncated = False
    if result and len(result) > MAX_ROWS:
        original_length = len(result)
        result = result[:MAX_ROWS]
        is_truncated = True
        Logger.instance().info(f"Query returned {original_length} rows, truncated to {MAX_ROWS}")

    # Transform the result into the expected format
    if result is None or len(result) == 0:
        response_data = {
            "columns": [],
            "rows": [],
            "is_truncated": False,
            "execution_time": execution_time,
            "source_name": source.name,
        }
    else:
        # Extract column names from the first row
        columns = list(result[0].keys()) if result else []
        response_data = {
            "columns": columns,
            "rows": result,
            "is_truncated": is_truncated,
            "execution_time": execution_time,
            "source_name": source.name,
        }

    return response_data
