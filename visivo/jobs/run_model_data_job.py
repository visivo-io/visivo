"""
Model data job - Executes SQL queries and writes results to parquet.

This is the canonical job for executing SQL and persisting model data.
Used by:
- run_sql_model_job.py when model data is needed
- model_query_job_executor.py for ad-hoc queries from the UI
"""

import os
from time import time

from visivo.models.sources.source import Source
from visivo.constants import DEFAULT_RUN_ID
from visivo.jobs.parquet_io import write_dicts_to_parquet


def write_parquet_from_data(
    data: list,
    output_dir: str,
    name_hash: str,
    run_id: str = DEFAULT_RUN_ID,
) -> str:
    """Write row data to a parquet file.

    Args:
        data: List of row dicts to write
        output_dir: Base output directory
        name_hash: Hash string for naming the parquet file
        run_id: Run ID for organizing output files

    Returns:
        Path to the written parquet file
    """
    files_directory = f"{output_dir}/{run_id}/files"
    os.makedirs(files_directory, exist_ok=True)
    parquet_path = f"{files_directory}/{name_hash}.parquet"
    write_dicts_to_parquet(data, parquet_path)
    return parquet_path


def write_query_to_parquet(
    source: Source,
    sql: str,
    output_dir: str,
    name_hash: str,
    run_id: str = DEFAULT_RUN_ID,
) -> str:
    """Execute SQL query and write results to parquet.

    Args:
        source: The data source to query
        sql: SQL query to execute
        output_dir: Base output directory
        name_hash: Hash string for naming the parquet file
        run_id: Run ID for organizing output files

    Returns:
        Path to the written parquet file

    Raises:
        Exception if query execution or file writing fails
    """
    data = source.read_sql(sql)
    return write_parquet_from_data(data, output_dir, name_hash, run_id)


def execute_and_get_result(
    source: Source,
    sql: str,
    output_dir: str = None,
    name_hash: str = None,
    run_id: str = DEFAULT_RUN_ID,
) -> dict:
    """Execute query and return result data directly.

    Used by model_query_job_executor for returning results to the UI.
    Optionally writes results to parquet when output_dir and name_hash are provided.

    Args:
        source: The data source to query
        sql: SQL query to execute
        output_dir: Base output directory (optional - if provided with name_hash, writes parquet)
        name_hash: Hash string for naming the parquet file (optional)
        run_id: Run ID for organizing output files

    Returns:
        Dict with columns, rows, row_count, execution_time_ms

    Raises:
        Exception if query fails
    """
    start_time = time()

    data = source.read_sql(sql)
    execution_time_ms = int((time() - start_time) * 1000)

    columns = list(data[0].keys()) if data else []

    if output_dir and name_hash:
        write_parquet_from_data(data, output_dir, name_hash, run_id)

    return {
        "columns": columns,
        "rows": data,
        "row_count": len(data),
        "execution_time_ms": execution_time_ms,
    }
