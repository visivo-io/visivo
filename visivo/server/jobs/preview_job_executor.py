"""Preview run execution logic for insights."""

import os
import json
from pydantic import ValidationError
from visivo.models.insight import Insight
from visivo.jobs.filtered_runner import FilteredRunner
from visivo.models.dag import all_descendants_of_type
from visivo.models.models.model import Model
from visivo.server.managers.preview_run_manager import RunStatus

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
    ("csv_script_model_manager", "csv_script_models"),
    ("local_merge_model_manager", "local_merge_models"),
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


CONTEXT_OBJECT_TYPES = {"models", "dimensions", "metrics", "inputs", "relations", "insights"}


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
    elif field_name == "inputs":
        from visivo.models.inputs.fields import InputField

        return TypeAdapter(InputField)
    elif field_name == "relations":
        from visivo.models.relation import Relation

        return TypeAdapter(Relation)
    elif field_name == "insights":
        return TypeAdapter(Insight)
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


def _assert_insights_present(project, insight_names):
    """Verify every requested insight is in the merged project. Raises ValueError otherwise."""
    project_insight_names = {i.name for i in (project.insights or [])}
    missing = [name for name in insight_names if name not in project_insight_names]
    if missing:
        raise ValueError(
            f"Preview requested for insights not present in project: {missing}. "
            f"Available: {sorted(project_insight_names)}"
        )


def _find_runner_error_for_insight(runner, insight_name):
    """Look up the upstream error message for ``insight_name`` (or any of
    its dependencies) from the runner's captured per-job failures.

    Returns ``None`` when no captured failure mentions the insight or
    when ``runner`` doesn't expose ``failed_job_results``. Used to
    surface the real cause of "insight file missing after execution"
    instead of the generic file-not-found message.
    """
    failed_results = getattr(runner, "failed_job_results", None)
    if not failed_results:
        return None
    # Prefer a direct match on the insight; fall back to any failure
    # since an upstream model failure is the most likely cause of a
    # missing insight JSON.
    direct = []
    upstream = []
    for result in failed_results:
        item = getattr(result, "item", None)
        item_name = getattr(item, "name", None)
        message = getattr(result, "message", None) or repr(result)
        if item_name == insight_name:
            direct.append((item_name, message))
        else:
            upstream.append((item_name, message))
    if direct:
        return direct[0][1]
    if upstream:
        name, message = upstream[0]
        prefix = f"upstream job '{name}' failed: " if name else "upstream job failed: "
        return prefix + str(message)
    return None


def _read_insight_result(output_dir, run_id, insight_name, runner=None):
    """Read one insight's result file and rewrite its signed_data_file_url path segments.

    When the JSON is missing — typically because the per-job soft
    failure suppressed an exception in the build pipeline — surface
    the upstream error from ``runner.failed_job_results`` instead of
    the generic "Insight file not found" message that obscures every
    real cause behind the same string.
    """
    insight_path = f"{output_dir}/{run_id}/insights/{insight_name}.json"
    if not os.path.exists(insight_path):
        upstream = _find_runner_error_for_insight(runner, insight_name) if runner else None
        if upstream:
            raise Exception(
                f"Preview build for insight '{insight_name}' produced no output. "
                f"Cause: {upstream}"
            )
        raise Exception(f"Insight file not found at {insight_path} after execution")
    with open(insight_path, "r") as f:
        insight_data = json.load(f)
    for file_info in insight_data.get("files", []):
        file_path = file_info.get("signed_data_file_url", "")
        if file_path:
            filename = os.path.basename(file_path)
            file_stem = filename.replace(".parquet", "")
            file_info["signed_data_file_url"] = f"/api/files/{file_stem}/{run_id}/"
    return insight_data


def execute_preview_job(
    job_id, insight_names, flask_app, output_dir, run_manager, context_objects=None
):
    """
    Execute a batched preview run for one or more insights.

    Args:
        job_id: Unique run identifier (also used for the filesystem run_id)
        insight_names: List of insight names to render. The backend builds a multi-node
            DAG filter from these names and runs them all in one invocation; shared
            upstream work is deduplicated by project_dag.combine_dags.
        flask_app: Flask application instance with project
        output_dir: Output directory for files
        run_manager: PreviewRunManager instance
        context_objects: Optional dict of {type: [configs]} overrides (models, insights,
            sources, inputs, metrics, dimensions, relations). Bodies for any insights
            in insight_names that are not already published should be sent here.

    Returns:
        None (updates run status via run_manager)
    """
    try:
        if not insight_names:
            raise ValueError("Preview job requires at least one insight name")

        run_manager.update_status(
            job_id,
            RunStatus.RUNNING,
            progress=0.1,
            progress_message="Validating config",
        )

        cleaned_context_objects = clean_config_strings(context_objects) if context_objects else {}

        run_manager.update_status(
            job_id,
            RunStatus.RUNNING,
            progress=0.2,
            progress_message="Preparing execution",
        )

        from copy import deepcopy

        preview_project = deepcopy(flask_app.project)

        _inject_cached_objects(flask_app, preview_project)
        _inject_context_objects(cleaned_context_objects, preview_project)

        _assert_insights_present(preview_project, insight_names)

        preview_project.invalidate_dag_cache()

        run_id = f"preview-{job_id}"
        dag_filter = ",".join(f"+{name}+" for name in insight_names)

        run_manager.update_status(
            job_id,
            RunStatus.RUNNING,
            progress=0.5,
            progress_message=f"Executing preview for {len(insight_names)} insight(s)",
        )

        runner = FilteredRunner(
            project=preview_project,
            output_dir=output_dir,
            threads=1,
            soft_failure=True,
            dag_filter=dag_filter,
            server_url="",
            working_dir=preview_project.path or "",
            run_id=run_id,
        )

        runner.run()

        run_manager.update_status(
            job_id,
            RunStatus.RUNNING,
            progress=0.9,
            progress_message="Finalizing results",
        )

        results = {
            name: _read_insight_result(output_dir, run_id, name, runner=runner)
            for name in insight_names
        }

        run_manager.set_result(job_id, {"insights": results, "run_id": run_id})
        run_manager.update_status(
            job_id,
            RunStatus.COMPLETED,
            progress=1.0,
            progress_message="Preview completed successfully",
        )

    except ValidationError as e:
        error_msg = f"Invalid preview configuration: {str(e)}"
        run_manager.update_status(
            job_id, RunStatus.FAILED, error=error_msg, progress_message="Validation failed"
        )
    except Exception as e:
        error_msg = f"Preview execution failed: {str(e)}"
        run_manager.update_status(
            job_id, RunStatus.FAILED, error=error_msg, progress_message="Execution failed"
        )
