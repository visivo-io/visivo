"""Preview run execution logic for insights."""

import os
import json
from pydantic import TypeAdapter, ValidationError
from visivo.models.insight import Insight
from visivo.jobs.filtered_runner import FilteredRunner
from visivo.models.dag import all_descendants_of_type
from visivo.models.models.model import Model
from visivo.server.managers.preview_run_manager import RunStatus
from visivo.models.base.named_model import alpha_hash


def clean_config_strings(obj):
    """Recursively clean newlines from string values in config."""
    if isinstance(obj, dict):
        return {k: clean_config_strings(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [clean_config_strings(item) for item in obj]
    elif isinstance(obj, str):
        # Strip trailing/leading newlines and whitespace
        return obj.strip()
    return obj


def execute_insight_preview_job(job_id, config, flask_app, output_dir, run_manager):
    """
    Execute a preview run for an insight configuration.

    Args:
        job_id: Unique run identifier (kept as job_id for API compatibility)
        config: Insight configuration dict
        flask_app: Flask application instance with project
        output_dir: Output directory for files
        run_manager: PreviewRunManager instance

    Returns:
        None (updates run status via run_manager)
    """
    try:
        run_manager.update_status(
            job_id,
            RunStatus.RUNNING,
            progress=0.1,
            progress_message="Validating config",
        )

        # Clean newlines and whitespace from config strings
        config = clean_config_strings(config)

        insight_adapter = TypeAdapter(Insight)
        insight = insight_adapter.validate_python(config)

        if not insight.name:
            insight.name = f"preview_{job_id[:8]}"

        run_id = f"preview-{insight.name}"

        run_manager.update_status(
            job_id,
            RunStatus.RUNNING,
            progress=0.2,
            progress_message="Preparing execution",
        )

        # Create a modified project with the preview insight replacing any existing one
        from copy import deepcopy

        preview_project = deepcopy(flask_app.project)

        # Remove existing insight with same name if it exists
        preview_project.insights = [
            i for i in (preview_project.insights or []) if i.name != insight.name
        ]

        # Add the preview insight
        if preview_project.insights is None:
            preview_project.insights = []
        preview_project.insights.append(insight)

        run_manager.update_status(
            job_id,
            RunStatus.RUNNING,
            progress=0.5,
            progress_message=f"Executing query for {insight.name or 'preview'}",
        )

        runner = FilteredRunner(
            project=preview_project,  # Use modified project with preview insight
            output_dir=output_dir,
            threads=1,
            soft_failure=True,
            dag_filter=f"+{insight.name}+",
            server_url="",
            working_dir=preview_project.path or "",
            run_id=run_id,
        )

        runner.run()

        name_hash = alpha_hash(insight.name)
        insight_path = f"{output_dir}/{run_id}/insights/{name_hash}.json"
        if os.path.exists(insight_path):
            run_manager.update_status(
                job_id,
                RunStatus.RUNNING,
                progress=0.9,
                progress_message="Finalizing results",
            )

            with open(insight_path, "r") as f:
                insight_data = json.load(f)

            for file_info in insight_data.get("files", []):
                file_path = file_info.get("signed_data_file_url", "")
                if file_path:
                    filename = os.path.basename(file_path)
                    file_hash = filename.replace(".parquet", "")
                    file_info["signed_data_file_url"] = f"/api/files/{file_hash}/{run_id}/"

            run_manager.set_result(job_id, insight_data)
            run_manager.update_status(
                job_id,
                RunStatus.COMPLETED,
                progress=1.0,
                progress_message="Preview completed successfully",
            )
        else:
            raise Exception(f"Insight file not found at {insight_path} after execution")

    except ValidationError as e:
        error_msg = f"Invalid insight configuration: {str(e)}"
        run_manager.update_status(
            job_id, RunStatus.FAILED, error=error_msg, progress_message="Validation failed"
        )
    except Exception as e:
        error_msg = f"Preview execution failed: {str(e)}"
        run_manager.update_status(
            job_id, RunStatus.FAILED, error=error_msg, progress_message="Execution failed"
        )
