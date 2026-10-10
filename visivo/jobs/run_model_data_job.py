"""
Model data job - Executes SQL queries and writes results to parquet.

This is the canonical job for executing SQL and persisting model data.
Used by:
- run_sql_model_job.py when model data is needed
- model_query_job_executor.py for ad-hoc queries from the UI
"""

import os
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from time import time

from visivo.models.sources.source import Source
from visivo.constants import DEFAULT_RUN_ID
from visivo.jobs.parquet_io import write_dicts_to_parquet

# Budgets for ad-hoc execution on behalf of a person or an agent. A build has
# no cap: it writes whatever the model returns.
UI_QUERY_TIMEOUT_S = 30
AGENT_QUERY_TIMEOUT_S = 20
UI_MAX_ROWS = 50_000


class QueryTimeout(TimeoutError):
    """The query did not return within its budget. The driver call is still
    running in its thread — a Python thread cannot be killed — so this bounds
    what a caller waits for, not what the database does."""


def _read_sql_within(source, sql, timeout_s):
    if timeout_s is None:
        return source.read_sql(sql)
    executor = ThreadPoolExecutor(max_workers=1)
    future = executor.submit(source.read_sql, sql)
    try:
        return future.result(timeout=timeout_s)
    except FutureTimeout:
        raise QueryTimeout(
            f"Query did not return within {timeout_s}s. Add a LIMIT, filter the "
            "rows, or aggregate in SQL before previewing."
        )
    finally:
        executor.shutdown(wait=False)


def write_parquet_from_data(
    data: list,
    output_dir: str,
    name: str,
    run_id: str = DEFAULT_RUN_ID,
) -> str:
    """Write row data to a parquet file.

    Args:
        data: List of row dicts to write
        output_dir: Base output directory
        name: Clean model name (used as the parquet filename)
        run_id: Run ID for organizing output files

    Returns:
        Path to the written parquet file
    """
    # Parquet lives in the directory named for what produced it — models/,
    # insights/, inputs/ — so the layout on disk says what each file IS. They
    # all used to share files/, which meant nothing downstream could tell a
    # model's data from a static insight's result without the dag (VIS-1128).
    models_directory = f"{output_dir}/{run_id}/models"
    os.makedirs(models_directory, exist_ok=True)
    parquet_path = f"{models_directory}/{name}.parquet"
    write_dicts_to_parquet(data, parquet_path)
    return parquet_path


def write_query_to_parquet(
    source: Source,
    sql: str,
    output_dir: str,
    name: str,
    run_id: str = DEFAULT_RUN_ID,
) -> str:
    """Execute SQL query and write results to parquet.

    Args:
        source: The data source to query
        sql: SQL query to execute
        output_dir: Base output directory
        name: Clean model name (used as the parquet filename)
        run_id: Run ID for organizing output files

    Returns:
        Path to the written parquet file

    Raises:
        Exception if query execution or file writing fails
    """
    data = source.read_sql(sql)
    return write_parquet_from_data(data, output_dir, name, run_id)


def execute_and_get_result(
    source: Source,
    sql: str,
    output_dir: str = None,
    name: str = None,
    run_id: str = DEFAULT_RUN_ID,
    *,
    max_rows: int = None,
    timeout_s: float = None,
) -> dict:
    """Execute a query and return its rows.

    Used by the model-query-jobs executor and the draft-insight preview for
    results that go straight back to a client, and optionally writes parquet
    when ``output_dir`` and ``name`` are given.

    ``max_rows`` trims what is returned (the parquet, if written, is whole)
    and sets ``truncated``; ``timeout_s`` raises ``QueryTimeout`` when the
    driver has not answered in time.

    Returns ``{columns, rows, row_count, truncated, execution_time_ms}``.
    """
    start_time = time()
    data = _read_sql_within(source, sql, timeout_s)
    execution_time_ms = int((time() - start_time) * 1000)

    columns = list(data[0].keys()) if data else []

    if output_dir and name:
        write_parquet_from_data(data, output_dir, name, run_id)

    truncated = max_rows is not None and len(data) > max_rows
    rows = data[:max_rows] if truncated else data

    return {
        "columns": columns,
        "rows": rows,
        "row_count": len(rows),
        "truncated": truncated,
        "execution_time_ms": execution_time_ms,
    }
