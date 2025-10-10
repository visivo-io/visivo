"""Query execution service for running SQL queries against sources."""

import time
from typing import Dict, Any, Optional
from visivo.logger.logger import Logger
from visivo.models.project import Project


MAX_ROWS = 100000


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
    result = source.read_sql(query)
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
