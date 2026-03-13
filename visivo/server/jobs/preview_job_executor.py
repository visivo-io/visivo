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


MANAGER_TO_PROJECT_FIELD = [
    ("model_manager", "models"),
    ("source_manager", "sources"),
    ("dimension_manager", "dimensions"),
    ("metric_manager", "metrics"),
    ("insight_manager", "insights"),
    ("chart_manager", "charts"),
    ("relation_manager", "relations"),
    ("table_manager", "tables"),
    ("dashboard_manager", "dashboards"),
    ("input_manager", "inputs"),
    ("markdown_manager", "markdowns"),
]


def _merge_objects_into_list(obj_list, new_objects):
    """Merge new objects into an existing list, replacing by name or appending.

    Args:
        obj_list: List of existing project objects (modified in place conceptually; returns new list)
        new_objects: Iterable of (name, object) tuples to merge in

    Returns:
        Updated list with new objects merged in
    """
    by_name = {o.name: o for o in obj_list if hasattr(o, "name")}
    for name, obj in new_objects:
        by_name[name] = obj
    unnamed = [o for o in obj_list if not hasattr(o, "name")]
    return list(by_name.values()) + unnamed


def _inject_cached_objects(flask_app, preview_project):
    """Inject cached objects from all managers into the preview project.

    This ensures preview can resolve refs to objects that exist only in
    the cached tier (created/modified via the editor or explorer) and
    not yet published to YAML.
    """
    from copy import deepcopy as _deepcopy

    for manager_attr, project_field in MANAGER_TO_PROJECT_FIELD:
        manager = getattr(flask_app, manager_attr, None)
        if not manager:
            continue

        cached = manager.cached_objects
        if not cached:
            continue

        obj_list = list(getattr(preview_project, project_field, None) or [])
        new_objects = [(name, _deepcopy(obj)) for name, obj in cached.items() if obj is not None]
        setattr(preview_project, project_field, _merge_objects_into_list(obj_list, new_objects))


CONTEXT_OBJECT_TYPES = {
    "models": "models",
    "dimensions": "dimensions",
    "metrics": "metrics",
}


def _get_type_adapter(field_name):
    """Get the TypeAdapter for a context object field, matching the project field type."""
    from pydantic import TypeAdapter

    if field_name == "models":
        from visivo.models.models.fields import ModelField

        return TypeAdapter(ModelField)
    elif field_name == "dimensions":
        from visivo.models.dimension import Dimension

        return TypeAdapter(Dimension)
    elif field_name == "metrics":
        from visivo.models.metric import Metric

        return TypeAdapter(Metric)
    return None


def _inject_context_objects(context_objects, preview_project):
    """Inject context object configs (from explorer) into preview project.

    Highest priority: overrides both published and cached objects.
    """
    if not context_objects:
        return

    for field_name, configs in context_objects.items():
        if field_name not in CONTEXT_OBJECT_TYPES or not configs:
            continue

        adapter = _get_type_adapter(field_name)
        if not adapter:
            continue

        obj_list = list(getattr(preview_project, field_name, None) or [])
        new_objects = [(obj.name, obj) for obj in (adapter.validate_python(c) for c in configs)]
        setattr(preview_project, field_name, _merge_objects_into_list(obj_list, new_objects))


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


def execute_insight_preview_job(
    job_id, config, flask_app, output_dir, run_manager, context_objects=None
):
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

        _inject_cached_objects(flask_app, preview_project)
        _inject_context_objects(context_objects, preview_project)

        # Remove existing insight with same name if it exists
        preview_project.insights = [
            i for i in (preview_project.insights or []) if i.name != insight.name
        ]

        # Add the preview insight
        if preview_project.insights is None:
            preview_project.insights = []
        preview_project.insights.append(insight)

        # Invalidate the cached DAG so it rebuilds with injected/new objects
        preview_project.invalidate_dag_cache()

        run_manager.update_status(
            job_id,
            RunStatus.RUNNING,
            progress=0.5,
            progress_message=f"Executing query for {insight.name or 'preview'}",
        )

        runner = FilteredRunner(
            project=preview_project,
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
