"""Compile and execute a draft insight against its source (VIS-1417).

Lifted out of ``/api/insight-execute-draft/`` so the agent's ``preview_insight``
tool and the Explorer's preview run the same code: one overlay build, one
single-source check, one query build, one bounded execution. The view maps a
``DraftInsightError`` to its HTTP status; the tool maps it to a refusal.
"""

from visivo.constants import DEFAULT_RUN_ID
from visivo.jobs.run_model_data_job import execute_and_get_result
from visivo.jobs.utils import get_source_for_model
from visivo.logger.logger import Logger
from visivo.query.insight.draft_overlay import DraftOverlayError, build_draft_overlay
from visivo.server.views.insight_draft_common import (
    build_schema_overrides,
    extract_model_not_run_name,
    is_model_not_run_error,
)


class DraftInsightError(Exception):
    """The preview cannot run, with the HTTP status and payload the view sends."""

    def __init__(self, status, payload):
        super().__init__(payload.get("error", "draft insight failed"))
        self.status = status
        self.payload = payload


def execute_draft_insight(
    flask_app,
    output_dir,
    insight_config,
    draft_models=(),
    draft_metrics=(),
    draft_dimensions=(),
    model_schemas=None,
    max_rows=None,
    timeout_s=None,
):
    """``{columns, rows, row_count, truncated, execution_time_ms, props_mapping,
    static_props, props_slices, split_key, type, models}`` or ``DraftInsightError``."""
    try:
        project, dag, insight = build_draft_overlay(
            flask_app,
            insight_config,
            draft_models=list(draft_models or []),
            draft_metrics=list(draft_metrics or []),
            draft_dimensions=list(draft_dimensions or []),
        )
    except DraftOverlayError as e:
        raise DraftInsightError(400, {"error": str(e)})
    except Exception as e:
        Logger.instance().error(f"execute-draft: overlay build failed: {e}")
        raise DraftInsightError(400, {"error": str(e)})

    schema_overrides = build_schema_overrides(dag, model_schemas or {})
    run_output_dir = f"{output_dir}/{DEFAULT_RUN_ID}"

    # A relation-join insight spans more than one model; the built pre_query
    # embeds every model's CTE, so they must all resolve to ONE source.
    try:
        dependent_models = insight.get_all_dependent_models(dag)
        source_names = {
            src.name
            for src in (get_source_for_model(m, dag, run_output_dir) for m in dependent_models)
            if src
        }
    except Exception as e:
        raise DraftInsightError(400, {"error": str(e)})
    if len(source_names) > 1:
        raise DraftInsightError(
            400,
            {
                "error": (
                    f"Insight '{insight.name}' references models from more than one "
                    f"source ({', '.join(sorted(source_names))}) and cannot be "
                    "previewed server-side."
                ),
                "error_type": "multi_source",
            },
        )

    try:
        query_info = insight.get_query_info(
            dag,
            run_output_dir,
            schema_overrides=schema_overrides or None,
            force_dynamic=False,
        )
    except Exception as e:
        message = str(e)
        if is_model_not_run_error(message):
            raise DraftInsightError(
                422,
                {
                    "error": message,
                    "error_type": "model_not_run",
                    "model": extract_model_not_run_name(message),
                },
            )
        Logger.instance().error(f"execute-draft: query build failed: {e}")
        raise DraftInsightError(400, {"error": message})

    # A dynamic insight (one that still references an Input) has no
    # pre_query: its placeholders are filled in the browser.
    if query_info.pre_query is None:
        raise DraftInsightError(
            409,
            {
                "error": "Insight query is dynamic (references an input); cannot execute server-side",
                "error_type": "requires_client_lane",
            },
        )

    try:
        source = insight.get_dependent_source(dag, run_output_dir)
    except Exception as e:
        raise DraftInsightError(400, {"error": str(e)})

    try:
        result = execute_and_get_result(
            source=source, sql=query_info.pre_query, max_rows=max_rows, timeout_s=timeout_s
        )
    except Exception as e:
        Logger.instance().error(f"execute-draft: source execution failed: {e}")
        raise DraftInsightError(400, {"error": str(e)})

    insight_type = None
    if insight.props is not None and insight.props.type is not None:
        insight_type = insight.props.type.value

    return {
        **result,
        "props_mapping": query_info.props_mapping,
        "static_props": query_info.static_props,
        "props_slices": query_info.props_slices,
        "split_key": query_info.split_key,
        "type": insight_type,
        "models": [{"name": m.name, "name_hash": m.name_hash()} for m in dependent_models],
    }
