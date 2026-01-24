"""Preview job execution logic for insights."""

import os
import json
from pydantic import TypeAdapter, ValidationError
from visivo.models.insight import Insight
from visivo.jobs.filtered_runner import FilteredRunner
from visivo.models.dag import all_descendants_of_type
from visivo.models.models.model import Model
from visivo.server.managers.preview_job_manager import JobStatus
from visivo.utils.alpha_hash import alpha_hash


def execute_insight_preview_job(job_id, config, flask_app, output_dir, job_manager):
    """
    Execute a preview job for an insight configuration.

    Args:
        job_id: Unique job identifier
        config: Insight configuration dict
        flask_app: Flask application instance with project
        output_dir: Output directory for files
        job_manager: PreviewJobManager instance

    Returns:
        None (updates job status via job_manager)
    """
    try:
        # Update status to running
        job_manager.update_status(
            job_id,
            JobStatus.RUNNING,
            progress=0.1,
            progress_message="Validating config",
        )

        # Validate insight config
        insight_adapter = TypeAdapter(Insight)
        insight = insight_adapter.validate_python(config)

        # If insight doesn't have a name, assign a temporary one
        if not insight.name:
            insight.name = f"preview_{job_id[:8]}"

        # Use preview-{insight_name} as run_id
        run_id = f"preview-{insight.name}"

        # Update progress: preparing
        job_manager.update_status(
            job_id,
            JobStatus.RUNNING,
            progress=0.2,
            progress_message="Preparing execution",
        )

        # Add the insight to the project DAG temporarily
        project_dag = flask_app.project.dag()
        project_dag.add_node(insight)

        # Get dependent models and add edges
        dependent_models = all_descendants_of_type(
            type=Model, dag=project_dag, from_node=insight
        )
        for model in dependent_models:
            project_dag.add_edge(model, insight)

        # Execute with FilteredRunner using run_id for custom file naming
        # Use dag_filter to run only this specific insight
        job_manager.update_status(
            job_id,
            JobStatus.RUNNING,
            progress=0.5,
            progress_message=f"Executing query for {insight.name or 'preview'}",
        )

        runner = FilteredRunner(
            project=flask_app.project,
            output_dir=output_dir,
            threads=1,
            soft_failure=True,
            dag_filter=f"+{insight.name}+",  # Filter to run only this insight
            server_url="",
            working_dir=flask_app.project.path or "",
            run_id=run_id,
        )

        # Run the filtered DAG (this will execute the insight job with dependencies)
        runner.run()

        # Check if job succeeded by looking at the DagRunner results
        # Files are now stored in: {output_dir}/{run_id}/insights/{name_hash}.json
        name_hash = alpha_hash(insight.name)
        insight_path = f"{output_dir}/{run_id}/insights/{name_hash}.json"
        if os.path.exists(insight_path):
            # Load result metadata
            job_manager.update_status(
                job_id,
                JobStatus.RUNNING,
                progress=0.9,
                progress_message="Finalizing results",
            )

            with open(insight_path, "r") as f:
                insight_data = json.load(f)

            # Convert file paths to API URLs with run_id
            for file_info in insight_data.get("files", []):
                file_path = file_info.get("signed_data_file_url", "")
                if file_path:
                    filename = os.path.basename(file_path)
                    file_hash = filename.replace(".parquet", "")
                    file_info["signed_data_file_url"] = f"/api/files/{file_hash}/{run_id}/"

            job_manager.set_result(job_id, insight_data)
            job_manager.update_status(
                job_id,
                JobStatus.COMPLETED,
                progress=1.0,
                progress_message="Preview completed successfully",
            )
        else:
            raise Exception(f"Insight file not found at {insight_path} after execution")

    except ValidationError as e:
        error_msg = f"Invalid insight configuration: {str(e)}"
        job_manager.update_status(
            job_id, JobStatus.FAILED, error=error_msg, progress_message="Validation failed"
        )
    except Exception as e:
        error_msg = f"Preview execution failed: {str(e)}"
        job_manager.update_status(
            job_id, JobStatus.FAILED, error=error_msg, progress_message="Execution failed"
        )
