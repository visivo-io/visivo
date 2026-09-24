from visivo.models.base.project_dag import ProjectDag
from visivo.models.dag import all_descendants_of_type
from visivo.models.models.model import Model
from visivo.models.insight import Insight
from visivo.jobs.job import (
    Job,
    JobResult,
    diagnostic_object_ref,
    format_message_failure,
    format_message_success,
)
from visivo.models.diagnostic import Diagnostic, DiagnosticPhase, DiagnosticRelated
from visivo.logger.query_error_logger import log_failed_query, extract_error_location
from time import time
from visivo.jobs.utils import get_source_for_model
from visivo.constants import DEFAULT_RUN_ID
import json
import os


def action(insight: Insight, dag: ProjectDag, output_dir, run_id=DEFAULT_RUN_ID):
    """Execute insight job - tokenize insight and generate insight.json file

    Args:
        insight: Insight object to execute
        dag: Project DAG with dependencies
        output_dir: Output directory for files
        run_id: Run ID for this execution (default: "main" for standard runs)
    """
    # Organize files by run_id
    # Structure: {output_dir}/{run_id}/{models,insights}/ — parquet lives in
    # the directory named for what produced it (VIS-1128).
    run_output_dir = f"{output_dir}/{run_id}"
    start_time = time()
    insight_query_info = None

    try:
        models = all_descendants_of_type(type=Model, dag=dag, from_node=insight)
        if not models:
            # B9 guard: a model-less insight must fail ITS job with a legible
            # diagnostic, not IndexError into the generic except below.
            return _missing_model_result(insight, start_time)
        model = models[0]
        source = get_source_for_model(model, dag, run_output_dir)

        insight_query_info = insight.get_query_info(dag, run_output_dir)

        # Validate post_query with inputs if it has placeholders (Phase 3: SQLGlot validation)
        if insight_query_info.post_query:
            import re
            from visivo.query.input_validator import validate_insight_with_inputs
            from visivo.query.patterns import INPUT_FRONTEND_PATTERN

            # Check if post_query has input placeholders (frontend pattern: ${input.accessor})
            has_placeholders = bool(
                re.search(INPUT_FRONTEND_PATTERN, insight_query_info.post_query)
            )

            if has_placeholders:
                try:
                    # Validate query with all input combinations
                    validate_insight_with_inputs(
                        insight=insight,
                        query=insight_query_info.post_query,
                        dag=dag,
                        output_dir=run_output_dir,
                        dialect="duckdb",  # Dynamic post_query always runs in DuckDB WASM
                    )
                except Exception as e:
                    raise ValueError(
                        f"Input validation failed for insight '{insight.name}': {str(e)}"
                    ) from e

        # A static insight's precomputed result is the insight's own file, so
        # it lives beside its metadata in insights/. A dynamic insight has none
        # — it references the models it queries, which live in models/.
        models_directory = f"{run_output_dir}/models"
        insights_directory = f"{run_output_dir}/insights"

        if insight_query_info.pre_query:
            from visivo.jobs.parquet_io import write_dicts_to_parquet

            data = source.read_sql(insight_query_info.pre_query)
            os.makedirs(insights_directory, exist_ok=True)
            # name_hash stays in the metadata as the DuckDB table identifier;
            # the file on disk uses the clean name for storage consistency.
            parquet_path = f"{insights_directory}/{insight.name}.parquet"
            write_dicts_to_parquet(data, parquet_path)
            files = [{"name_hash": insight.name_hash(), "signed_data_file_url": parquet_path}]
        else:
            models = insight.get_all_dependent_models(dag=dag)
            files = [
                {
                    "name_hash": model.name_hash(),
                    "signed_data_file_url": f"{models_directory}/{model.name}.parquet",
                }
                for model in models
                if os.path.exists(f"{models_directory}/{model.name}.parquet")
            ]

        # Store insight metadata with file references and post_query
        insight_data = {
            "name": insight.name,
            "files": files,
            "query": insight_query_info.post_query,
            "props_mapping": insight_query_info.props_mapping,
            "static_props": insight_query_info.static_props,  # Non-query props (e.g., marker.color)
            # Per-prop slice suffix from authored ?{...}[N|a:b] forms; the
            # viewer applies the slice to the bound array after the query
            # column is mapped to the prop. Empty when no prop has a slice.
            "props_slices": insight_query_info.props_slices,
            "split_key": insight_query_info.split_key,
            "type": insight.props.type.value,  # Trace type (bar, scatter, etc.)
        }

        os.makedirs(insights_directory, exist_ok=True)
        insight_path = os.path.join(insights_directory, f"{insight.name}.json")
        with open(insight_path, "w") as f:
            json.dump(insight_data, f, indent=2)

        success_message = format_message_success(
            details=f"Updated data for insight \033[4m{insight.name}\033[0m",
            start_time=start_time,
            full_path=None,
        )
        return JobResult(item=insight, success=True, message=success_message)

    except Exception as e:
        if hasattr(e, "message"):
            message = e.message
        else:
            message = repr(e)

        # Preserve structured fields for join-path failures so the preview
        # run-status payload can drive the inline "draw the join" card
        # (VIS-1007) instead of dead-ending on a generic red error block.
        from visivo.query.relation_graph import (
            JoinPathError,
            join_error_to_structured_fields,
        )

        error_details = None
        if isinstance(e, JoinPathError):
            error_details = join_error_to_structured_fields(e)

        # Log failed query to file for debugging
        query_file = None
        if insight_query_info and insight_query_info.pre_query:
            error_location = extract_error_location(message)
            query_file = log_failed_query(
                output_dir=output_dir,
                item_name=insight.name,
                item_type="insight",
                query=insight_query_info.pre_query,
                error_msg=message,
                error_location=error_location,
            )

        # Format error with location and query file reference
        error_location = extract_error_location(message)
        error_display = message
        if error_location:
            error_display = f"{message}\n        at {error_location}"
        if query_file:
            error_display = f"{error_display}\n        query saved to: {query_file}"

        failure_message = format_message_failure(
            details=f"Failed job for insight \033[4m{insight.name}\033[0m",
            start_time=start_time,
            full_path=None,
            error_msg=error_display,
        )
        # error_details' error_type values are registered diagnostic codes by
        # design (missing_relation / ambiguous_relation) — everything else is a
        # query that the source refused.
        diagnostic = Diagnostic.from_exception(
            e,
            phase=DiagnosticPhase.RUN,
            code=error_details["error_type"] if error_details else "query_execution_failed",
            object=diagnostic_object_ref(insight),
            related=[
                DiagnosticRelated(
                    message=f"Join endpoint model '{model_name}'",
                    object={"type": "model", "name": model_name},
                )
                for model_name in (error_details or {}).get("error_models", [])
            ],
        )
        return JobResult(
            item=insight,
            success=False,
            message=failure_message,
            error_details=error_details,
            diagnostic=diagnostic,
        )


def _missing_model_result(insight: Insight, start_time) -> JobResult:
    """The failed JobResult for an insight that references no model (B9)."""
    message = f"Insight '{insight.name}' does not reference a model, so it has no data to run."
    failure_message = format_message_failure(
        details=f"Failed job for insight \033[4m{insight.name}\033[0m",
        start_time=start_time,
        full_path=None,
        error_msg=message,
    )
    return JobResult(
        item=insight,
        success=False,
        message=failure_message,
        diagnostic=Diagnostic(
            phase=DiagnosticPhase.RUN,
            code="missing_model",
            message=message,
            object=diagnostic_object_ref(insight),
            hint=(
                "Reference a model column in the insight's props, "
                "e.g. x: ?{ ${ref(my_model).my_column} }."
            ),
        ),
    )


def missing_model_action(insight: Insight) -> JobResult:
    """Job action for a model-less insight: report the failure through the
    normal JobResult channel instead of crashing the runner (B9)."""
    return _missing_model_result(insight, time())


def _get_source(insight, dag, output_dir):
    """Get the appropriate source for an insight, or None when the insight
    references no model."""
    models = all_descendants_of_type(type=Model, dag=dag, from_node=insight)
    if not models:
        return None
    return get_source_for_model(models[0], dag, output_dir)


def job(dag, output_dir: str, insight: Insight, run_id: str = None):
    """Create insight job for execution in the DAG runner

    Args:
        dag: Project DAG
        output_dir: Output directory for files
        insight: Insight object to execute
        run_id: Optional run ID for preview runs (passed to action for custom file naming)
    """
    run_output_dir = f"{output_dir}/{run_id}" if run_id is not None else f"{output_dir}/main"
    if not all_descendants_of_type(type=Model, dag=dag, from_node=insight):
        # B9: this used to IndexError right here — at job-creation time, inside
        # the DAG runner's scheduling loop — killing the whole run (and, from
        # `visivo run`, the process) instead of failing the one insight. Hand
        # back a job whose action reports the failure like any other.
        return Job(item=insight, source=None, action=missing_model_action, insight=insight)
    source = _get_source(insight, dag, run_output_dir)
    kwargs = {
        "insight": insight,
        "dag": dag,
        "output_dir": output_dir,
    }
    if run_id is not None:
        kwargs["run_id"] = run_id

    return Job(item=insight, source=source, action=action, **kwargs)
