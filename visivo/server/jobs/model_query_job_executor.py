"""Model query job execution logic for SQL queries against sources."""

import time
from visivo.server.managers.preview_run_manager import RunStatus
from visivo.server.services.query_service import parse_sql_error
from visivo.logger.logger import Logger


DEFAULT_LIMIT = 1000
MAX_LIMIT = 10000


def execute_model_query_job(job_id, config, flask_app, output_dir, job_manager):
    """
    Execute a SQL query against a source.

    Args:
        job_id: Unique job identifier
        config: Query configuration dict containing:
            - source_name: Name of the source to query
            - sql: SQL query to execute
            - limit: Optional max rows to return (default 1000, max 10000)
        flask_app: Flask application instance with source_manager
        output_dir: Output directory (not used but kept for consistency)
        job_manager: ModelQueryJobManager instance

    Returns:
        None (updates job status via job_manager)
    """
    try:
        job_manager.update_status(
            job_id,
            RunStatus.RUNNING,
            progress=0.1,
            progress_message="Starting query execution",
        )

        source_name = config.get("source_name")
        sql = config.get("sql")
        limit = config.get("limit", DEFAULT_LIMIT)

        # Clamp limit to valid range
        limit = min(max(1, int(limit)), MAX_LIMIT)

        job_manager.update_status(
            job_id,
            RunStatus.RUNNING,
            progress=0.2,
            progress_message="Retrieving source",
        )

        # Get source from source_manager (supports both published and draft sources)
        source = flask_app.source_manager.get(source_name)

        if not source:
            raise ValueError(f"Source '{source_name}' not found")

        job_manager.update_status(
            job_id,
            RunStatus.RUNNING,
            progress=0.3,
            progress_message="Preparing query",
        )

        # Add LIMIT if not already present in query
        sql_stripped = sql.strip().rstrip(";")
        sql_lower = sql_stripped.lower()

        if "limit" not in sql_lower:
            sql_with_limit = f"{sql_stripped} LIMIT {limit}"
        else:
            sql_with_limit = sql_stripped

        job_manager.update_status(
            job_id,
            RunStatus.RUNNING,
            progress=0.5,
            progress_message="Executing query",
        )

        Logger.instance().info(f"Executing model query job {job_id} on source {source_name}")

        # Execute the query and measure execution time
        start_time = time.time()
        try:
            result = source.read_sql(sql_with_limit)
        except Exception as e:
            enhanced_error = parse_sql_error(e, sql)
            raise ValueError(enhanced_error) from e
        execution_time_ms = int((time.time() - start_time) * 1000)

        job_manager.update_status(
            job_id,
            RunStatus.RUNNING,
            progress=0.8,
            progress_message="Processing results",
        )

        # Check if results were truncated
        truncated = False
        if result and len(result) > limit:
            result = result[:limit]
            truncated = True

        # Format the result
        if result is None or len(result) == 0:
            response_data = {
                "columns": [],
                "rows": [],
                "row_count": 0,
                "truncated": False,
                "execution_time_ms": execution_time_ms,
                "source_name": source_name,
            }
        else:
            columns = list(result[0].keys()) if result else []
            response_data = {
                "columns": columns,
                "rows": result,
                "row_count": len(result),
                "truncated": truncated,
                "execution_time_ms": execution_time_ms,
                "source_name": source_name,
            }

        job_manager.set_result(job_id, response_data)
        job_manager.update_status(
            job_id,
            RunStatus.COMPLETED,
            progress=1.0,
            progress_message="Query completed successfully",
        )

        Logger.instance().info(
            f"Model query job {job_id} completed: {response_data['row_count']} rows in {execution_time_ms}ms"
        )

    except ValueError as e:
        error_msg = str(e)
        job_manager.update_status(
            job_id, RunStatus.FAILED, error=error_msg, progress_message="Query failed"
        )
        Logger.instance().error(f"Model query job {job_id} failed: {error_msg}")
    except Exception as e:
        error_msg = f"Query execution failed: {str(e)}"
        job_manager.update_status(
            job_id, RunStatus.FAILED, error=error_msg, progress_message="Execution failed"
        )
        Logger.instance().error(f"Model query job {job_id} failed unexpectedly: {error_msg}")
