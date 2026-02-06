"""Model query job execution logic for SQL queries against sources using FilteredRunner."""

import os
import time
from copy import deepcopy

import polars as pl

from visivo.models.models.sql_model import SqlModel
from visivo.jobs.filtered_runner import FilteredRunner
from visivo.server.managers.preview_run_manager import RunStatus
from visivo.logger.logger import Logger


def read_parquet_to_result(parquet_path: str, source_name: str, execution_time_ms: int) -> dict:
    """Read parquet file and convert to API result format."""
    if not os.path.exists(parquet_path):
        raise FileNotFoundError(f"Query result not found at {parquet_path}")

    df = pl.read_parquet(parquet_path)
    rows = df.to_dicts()

    return {
        "columns": df.columns,
        "rows": rows,
        "row_count": len(rows),
        "execution_time_ms": execution_time_ms,
        "source_name": source_name,
    }


def execute_model_query_job(job_id, config, flask_app, output_dir, job_manager):
    """
    Execute a model query job using FilteredRunner (like insight previews).

    Flow:
    1. Create temporary SqlModel from {source_name, sql}
    2. Add to a deepcopy of the project
    3. Run FilteredRunner with dag_filter targeting the temp model
    4. Read output parquet file
    5. Convert to result format {columns, rows, row_count, ...}

    Args:
        job_id: Unique job identifier
        config: Query configuration dict containing:
            - source_name: Name of the source to query
            - sql: SQL query to execute
        flask_app: Flask application instance with project
        output_dir: Output directory for files
        job_manager: ModelQueryJobManager instance

    Returns:
        None (updates job status via job_manager)
    """
    try:
        job_manager.update_status(
            job_id,
            RunStatus.RUNNING,
            progress=0.1,
            progress_message="Creating temporary model",
        )

        source_name = config.get("source_name")
        sql = config.get("sql")

        # Create temporary SqlModel
        temp_model_name = f"temp_query_{job_id[:8]}"
        temp_model = SqlModel(
            name=temp_model_name,
            sql=sql,
            source=f"ref({source_name})" if source_name else None,
        )

        run_id = f"query-{temp_model_name}"

        job_manager.update_status(
            job_id,
            RunStatus.RUNNING,
            progress=0.2,
            progress_message="Preparing execution",
        )

        # Create modified project with temp model
        preview_project = deepcopy(flask_app.project)
        if preview_project.models is None:
            preview_project.models = []
        preview_project.models.append(temp_model)

        job_manager.update_status(
            job_id,
            RunStatus.RUNNING,
            progress=0.5,
            progress_message="Executing query",
        )

        Logger.instance().info(f"Executing model query job {job_id} on source {source_name}")

        # Execute via FilteredRunner
        start_time = time.time()
        runner = FilteredRunner(
            project=preview_project,
            output_dir=output_dir,
            threads=1,
            soft_failure=True,
            dag_filter=f"+{temp_model_name}+",
            server_url="",
            working_dir=preview_project.path or "",
            run_id=run_id,
        )
        runner.run()
        execution_time_ms = int((time.time() - start_time) * 1000)

        job_manager.update_status(
            job_id,
            RunStatus.RUNNING,
            progress=0.8,
            progress_message="Processing results",
        )

        # Read output parquet file
        model_hash = temp_model.name_hash()
        parquet_path = f"{output_dir}/{run_id}/files/{model_hash}.parquet"

        result = read_parquet_to_result(parquet_path, source_name, execution_time_ms)

        job_manager.set_result(job_id, result)
        job_manager.update_status(
            job_id,
            RunStatus.COMPLETED,
            progress=1.0,
            progress_message="Query completed successfully",
        )

        Logger.instance().info(
            f"Model query job {job_id} completed: {result['row_count']} rows in {execution_time_ms}ms"
        )

    except FileNotFoundError as e:
        error_msg = f"Query execution failed: {str(e)}"
        job_manager.update_status(
            job_id, RunStatus.FAILED, error=error_msg, progress_message="Execution failed"
        )
        Logger.instance().error(f"Model query job {job_id} failed: {error_msg}")
    except Exception as e:
        error_msg = f"Query execution failed: {str(e)}"
        job_manager.update_status(
            job_id, RunStatus.FAILED, error=error_msg, progress_message="Execution failed"
        )
        Logger.instance().error(f"Model query job {job_id} failed unexpectedly: {error_msg}")
