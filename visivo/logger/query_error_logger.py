"""
Query error logging utility for writing failed queries to disk.

This module provides functions to log failed SQL queries with error context,
making debugging easier by preserving the exact query that failed along with
error location information.
"""

import os
import re
from datetime import datetime
from typing import Optional


def log_failed_query(
    output_dir: str,
    item_name: str,
    item_type: str,
    query: str,
    error_msg: str,
    error_location: Optional[str] = None,
) -> str:
    """
    Write failed query to logs directory and return path for error message.

    Creates a .sql file containing the failed query with error context as
    SQL comments in the header. This allows users to easily inspect and
    debug the exact SQL that caused the failure.

    Args:
        output_dir: Base output directory (e.g., target/)
        item_name: Name of the insight or other item that failed
        item_type: Type of item (e.g., "insight")
        query: The SQL query that failed
        error_msg: Error message from the database
        error_location: Optional location info (e.g., "line 7, column 45")

    Returns:
        Path to the logged query file
    """
    logs_dir = os.path.join(output_dir, "logs", "failed_queries")
    os.makedirs(logs_dir, exist_ok=True)

    # Create unique filename with timestamp
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    # Sanitize item name for filename
    safe_name = re.sub(r"[^\w\-]", "_", item_name)[:50]
    filename = f"{item_type}_{safe_name}_{timestamp}.sql"
    filepath = os.path.join(logs_dir, filename)

    # Write query with error context as SQL comments in header
    with open(filepath, "w") as f:
        f.write(f"-- Failed {item_type}: {item_name}\n")
        f.write(f"-- Error: {error_msg}\n")
        if error_location:
            f.write(f"-- Location: {error_location}\n")
        f.write(f"-- Time: {datetime.now().isoformat()}\n")
        f.write("-- " + "=" * 60 + "\n\n")
        f.write(query)

    return filepath


def extract_error_location(error_msg: str) -> Optional[str]:
    """
    Extract line/column info from database error messages.

    Supports various database error message formats:
    - BigQuery: "at [7:45]"
    - PostgreSQL: "at character 123" or "line 7"
    - Generic: "line 7, column 45"

    Args:
        error_msg: Error message from the database

    Returns:
        Formatted location string (e.g., "line 7, column 45") or None if not found
    """
    if not error_msg:
        return None

    # BigQuery format: "at [line:column]"
    match = re.search(r"\[(\d+):(\d+)\]", error_msg)
    if match:
        return f"line {match.group(1)}, column {match.group(2)}"

    # PostgreSQL format: "at character N"
    match = re.search(r"at character (\d+)", error_msg, re.IGNORECASE)
    if match:
        return f"character {match.group(1)}"

    # Generic format: "line N, column M" or "line N column M"
    match = re.search(r"line\s+(\d+)(?:,?\s*column\s+(\d+))?", error_msg, re.IGNORECASE)
    if match:
        line = match.group(1)
        col = match.group(2)
        if col:
            return f"line {line}, column {col}"
        return f"line {line}"

    return None
