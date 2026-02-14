"""
Model data job - Executes SQL queries and writes results to parquet.

This is the canonical job for executing SQL and persisting model data.
Used by:
- run_sql_model_job.py when model data is needed
- model_query_job_executor.py for ad-hoc queries from the UI
"""

import os
from time import time
import polars as pl

from visivo.jobs.job import (
    JobResult,
    format_message_failure,
    format_message_success,
)
from visivo.models.base.named_model import NamedModel
from visivo.models.sources.source import Source
from visivo.constants import DEFAULT_RUN_ID


def _get_error_message(e: Exception) -> str:
    """Extract error message from exception."""
    if hasattr(e, "message"):
        return e.message
    return repr(e)


def model_data_action(
    item: NamedModel,
    source: Source,
    sql: str,
    output_dir: str,
    run_id: str = DEFAULT_RUN_ID,
) -> JobResult:
    """
    Execute SQL query and write results to parquet.

    Args:
        item: The model/item being executed (for naming and result tracking)
        source: The data source to query
        sql: SQL query to execute
        output_dir: Base output directory
        run_id: Run ID for organizing output files

    Returns:
        JobResult with success/failure status and parquet path in message
    """
    start_time = time()
    name_hash = item.name_hash()

    run_output_dir = f"{output_dir}/{run_id}"
    files_directory = f"{run_output_dir}/files"

    try:
        data = source.read_sql(sql)

        df = pl.DataFrame(data)
        os.makedirs(files_directory, exist_ok=True)
        parquet_path = f"{files_directory}/{name_hash}.parquet"
        df.write_parquet(parquet_path)

        success_message = format_message_success(
            details=f"Executed query and wrote data for \033[4m{item.name}\033[0m",
            start_time=start_time,
            full_path=parquet_path,
        )
        return JobResult(item=item, success=True, message=success_message)

    except Exception as e:
        failure_message = format_message_failure(
            details=f"Failed to execute query for \033[4m{item.name}\033[0m",
            start_time=start_time,
            full_path=getattr(item, "file_path", None),
            error_msg=_get_error_message(e),
        )
        return JobResult(item=item, success=False, message=failure_message)


def execute_and_get_result(
    source: Source,
    sql: str,
    output_dir: str = None,
    item: NamedModel = None,
    run_id: str = DEFAULT_RUN_ID,
) -> dict:
    """
    Execute query and return result data directly.

    Used by model_query_job_executor for returning results to the UI.

    Args:
        source: The data source to query
        sql: SQL query to execute
        output_dir: Base output directory (optional - if provided, writes parquet)
        item: The model/item being executed (optional - for naming parquet file)
        run_id: Run ID for organizing output files

    Returns:
        Dict with columns, rows, row_count, execution_time_ms

    Raises:
        Exception if query fails
    """
    start_time = time()

    data = source.read_sql(sql)
    execution_time_ms = int((time() - start_time) * 1000)

    df = pl.DataFrame(data)
    rows = df.to_dicts()

    if output_dir and item:
        name_hash = item.name_hash()
        run_output_dir = f"{output_dir}/{run_id}"
        files_directory = f"{run_output_dir}/files"
        os.makedirs(files_directory, exist_ok=True)
        parquet_path = f"{files_directory}/{name_hash}.parquet"
        df.write_parquet(parquet_path)

    return {
        "columns": df.columns,
        "rows": rows,
        "row_count": len(rows),
        "execution_time_ms": execution_time_ms,
    }
