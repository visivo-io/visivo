"""
Source schema job executor - background execution of schema generation.

Follows the pattern from preview_job_executor.py:
- Accepts config dict and flask_app for project context
- Uses consistent progress reporting
"""

from visivo.logger.logger import Logger
from visivo.server.managers.preview_run_manager import RunStatus
from visivo.jobs.run_source_schema_job import action as run_source_schema_action


def execute_source_schema_job(job_id, config, flask_app, output_dir, run_manager):
    """
    Execute a schema generation job for a source in the background.

    Args:
        job_id: Unique job identifier
        config: Configuration dict with source_name and source_type
        flask_app: Flask application instance with project
        output_dir: Output directory for schema files
        run_manager: PreviewRunManager instance for status updates

    Returns:
        None (updates run status via run_manager)
    """
    source_name = config.get("source_name")
    run_id = f"preview-{source_name}"

    try:
        run_manager.update_status(
            job_id,
            RunStatus.RUNNING,
            progress=0.1,
            progress_message=f"Starting schema generation for {source_name}",
        )

        Logger.instance().info(f"Executing schema generation job {job_id} for source {source_name}")

        source = flask_app.project.find_source(source_name)
        if source is None:
            raise Exception(f"Source '{source_name}' not found in project")

        run_manager.update_status(
            job_id,
            RunStatus.RUNNING,
            progress=0.3,
            progress_message=f"Connecting to {source_name}",
        )

        result = run_source_schema_action(
            source_to_build=source,
            table_names=None,
            output_dir=output_dir,
            run_id=run_id,
        )

        if result.success:
            run_manager.update_status(
                job_id,
                RunStatus.COMPLETED,
                progress=1.0,
                progress_message=f"Schema generation completed for {source_name}",
            )
            run_manager.set_result(
                job_id,
                {
                    "source_name": source_name,
                    "source_type": source.type,
                    "message": result.message,
                },
            )
            Logger.instance().info(f"Schema generation job {job_id} completed successfully")
        else:
            error_msg = f"Schema generation failed: {result.message}"
            run_manager.update_status(
                job_id,
                RunStatus.FAILED,
                error=error_msg,
                progress_message="Schema generation failed",
            )
            Logger.instance().error(f"Schema generation job {job_id} failed: {result.message}")

    except Exception as e:
        error_msg = f"Schema generation error: {str(e)}"
        Logger.instance().error(f"Schema generation job {job_id} exception: {error_msg}")
        run_manager.update_status(
            job_id,
            RunStatus.FAILED,
            error=error_msg,
            progress_message="Schema generation failed",
        )
