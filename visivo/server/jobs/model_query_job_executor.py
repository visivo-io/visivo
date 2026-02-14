"""Model query job execution logic using the model data job infrastructure."""

from visivo.jobs.run_model_data_job import execute_and_get_result
from visivo.server.managers.preview_run_manager import RunStatus
from visivo.logger.logger import Logger


def find_source_by_name(project, source_name: str):
    """Find a source by name in the project."""
    if not project.sources:
        return None
    for source in project.sources:
        if hasattr(source, "name") and source.name == source_name:
            return source
    return None


def execute_model_query_job(job_id, config, flask_app, output_dir, job_manager):
    """
    Execute a model query job using the unified model data job infrastructure.

    Flow:
    1. Find the source by name in the project
    2. Execute the SQL query using execute_and_get_result from run_model_data_job
    3. Return results in API format {columns, rows, row_count, ...}

    Args:
        job_id: Unique job identifier
        config: Query configuration dict containing:
            - source_name: Name of the source to query
            - sql: SQL query to execute
        flask_app: Flask application instance with project
        output_dir: Output directory for files (unused but kept for API compatibility)
        job_manager: ModelQueryJobManager instance

    Returns:
        None (updates job status via job_manager)
    """
    try:
        job_manager.update_status(
            job_id,
            RunStatus.RUNNING,
            progress=0.1,
            progress_message="Preparing query",
        )

        source_name = config.get("source_name")
        sql = config.get("sql")

        if not source_name:
            raise ValueError("source_name is required")
        if not sql:
            raise ValueError("sql is required")

        job_manager.update_status(
            job_id,
            RunStatus.RUNNING,
            progress=0.2,
            progress_message="Finding source",
        )

        source = find_source_by_name(flask_app.project, source_name)
        if not source:
            raise ValueError(f"Source '{source_name}' not found in project")

        job_manager.update_status(
            job_id,
            RunStatus.RUNNING,
            progress=0.3,
            progress_message="Executing query",
        )

        Logger.instance().info(f"Executing model query job {job_id} on source {source_name}")

        result = execute_and_get_result(
            source=source,
            sql=sql,
        )

        job_manager.update_status(
            job_id,
            RunStatus.RUNNING,
            progress=0.8,
            progress_message="Processing results",
        )

        result["source_name"] = source_name

        job_manager.set_result(job_id, result)
        job_manager.update_status(
            job_id,
            RunStatus.COMPLETED,
            progress=1.0,
            progress_message="Query completed successfully",
        )

        Logger.instance().info(
            f"Model query job {job_id} completed: {result['row_count']} rows in {result['execution_time_ms']}ms"
        )

    except ValueError as e:
        error_msg = str(e)
        job_manager.update_status(
            job_id, RunStatus.FAILED, error=error_msg, progress_message="Validation failed"
        )
        Logger.instance().error(f"Model query job {job_id} failed: {error_msg}")
    except Exception as e:
        error_msg = f"Query execution failed: {str(e)}"
        job_manager.update_status(
            job_id, RunStatus.FAILED, error=error_msg, progress_message="Execution failed"
        )
        Logger.instance().error(f"Model query job {job_id} failed unexpectedly: {error_msg}")
