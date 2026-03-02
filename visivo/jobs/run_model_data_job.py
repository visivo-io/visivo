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

from visivo.models.sources.source import Source
from visivo.constants import DEFAULT_RUN_ID


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
    run_output_dir = f"{output_dir}/{run_id}"
    files_directory = f"{run_output_dir}/files"

    data = source.read_sql(sql)

    df = pl.DataFrame(data)
    os.makedirs(files_directory, exist_ok=True)
    parquet_path = f"{files_directory}/{name_hash}.parquet"
    df.write_parquet(parquet_path)

    return parquet_path


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
        df = pl.DataFrame(data)
        run_output_dir = f"{output_dir}/{run_id}"
        files_directory = f"{run_output_dir}/files"
        os.makedirs(files_directory, exist_ok=True)
        parquet_path = f"{files_directory}/{name_hash}.parquet"
        df.write_parquet(parquet_path)

    return {
        "columns": columns,
        "rows": data,
        "row_count": len(data),
        "execution_time_ms": execution_time_ms,
    }
