"""Draft insight EXECUTE endpoint (Explore 2.0 state fix, Phase 3) — the
correctness half of the draft preview.

``POST /api/insight-execute-draft/`` — for an AGGREGATE / semantic draft insight
(one ``/api/insight-compile-draft/`` classified ``requires_full_source: true``),
the client cannot get correct numbers by running the compiled query over its
fetched PREVIEW SAMPLE in DuckDB-WASM: a SUM / COUNT / window / relation-join
over a 1,000-row sample is not the real result. This endpoint builds the SAME
in-memory draft overlay compile-draft uses, but with ``force_dynamic=False`` so
``get_query_info`` yields the real SOURCE-dialect query (CTEs over the real
tables + relation joins + aggregations + GROUP BY / HAVING / QUALIFY / ORDER BY),
executes it ONCE against the source, and returns the final chart rows.

Like compile-draft it builds an ephemeral deepcopy overlay and NEVER writes
artifacts or schedules a run — it only adds a single blocking source read
(``execute_and_get_result`` with no ``output_dir``/``name``, so no parquet).
Raw-column PROJECTION previews never reach here; the client keeps computing
those instantly client-side over the sample.

Response contract:
  200 { columns, rows, row_count, execution_time_ms, props_mapping,
        static_props, props_slices, split_key, type, models: [{name, name_hash}] }
        — ``rows`` ARE the final chart rows (aggregations / joins applied); the
        client binds them straight through ``props_mapping``, no DuckDB
        post_query.
  400 { error } — malformed body / draft validation / no source / execution /
        SQLGlot failure.
  409 { error, error_type: "requires_client_lane" } — the insight references a
        real Input, so its query is dynamic (``pre_query`` is None) and cannot be
        baked server-side; the client falls back to its DuckDB sample lane.
  422 { error, error_type: "model_not_run", model } — a ref names a scratch
        model with no schema (never run, and no ``model_schemas`` sent).
"""

from flask import request, jsonify

from visivo.constants import DEFAULT_RUN_ID
from visivo.logger.logger import Logger
from visivo.query.insight.draft_overlay import build_draft_overlay, DraftOverlayError
from visivo.jobs.run_model_data_job import execute_and_get_result

# The graceful never-run-scratch-model markers + name extractor are the compile
# endpoint's; reuse them verbatim so both draft endpoints report the exact same
# 422 shape for the exact same condition.
from visivo.server.views.insight_compile_views import (
    _MODEL_NOT_RUN_MARKERS,
    _extract_model_not_run_name,
)


def register_insight_execute_views(app, flask_app, output_dir):
    @app.route("/api/insight-execute-draft/", methods=["POST"])
    def execute_draft_insight():
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify({"error": "Request body must be a JSON object"}), 400

        insight_config = data.get("insight")
        if not isinstance(insight_config, dict) or not insight_config.get("name"):
            return (
                jsonify({"error": "'insight' (an object with at least a 'name') is required"}),
                400,
            )

        draft_models = data.get("draft_models") or []
        draft_metrics = data.get("draft_metrics") or []
        draft_dimensions = data.get("draft_dimensions") or []
        model_schemas = data.get("model_schemas") or {}

        try:
            project, dag, insight = build_draft_overlay(
                flask_app,
                insight_config,
                draft_models=draft_models,
                draft_metrics=draft_metrics,
                draft_dimensions=draft_dimensions,
            )
        except DraftOverlayError as e:
            return jsonify({"error": str(e)}), 400
        except Exception as e:
            Logger.instance().error(f"execute-draft: overlay build failed: {e}")
            return jsonify({"error": str(e)}), 400

        # Same client-supplied schema seeding as compile-draft: a scratch model
        # with no server-side schemas/<model>/schema.json yet is closed by the
        # columns the client already introspected. Keyed by model name, value
        # shape {model_hash: {column: type}}.
        schema_overrides = {}
        for model_name, columns in model_schemas.items():
            if not isinstance(columns, dict):
                continue
            try:
                model_node = dag.get_descendant_by_name(model_name)
            except Exception:
                continue
            model_hash = getattr(model_node, "name_hash", lambda: None)()
            if model_hash:
                schema_overrides[model_name] = {model_hash: columns}

        run_output_dir = f"{output_dir}/{DEFAULT_RUN_ID}"
        try:
            query_info = insight.get_query_info(
                dag,
                run_output_dir,
                schema_overrides=schema_overrides or None,
                # The real source query (pre_query), NOT the DuckDB-over-sample
                # post_query the compile endpoint returns.
                force_dynamic=False,
            )
        except Exception as e:
            message = str(e)
            if any(marker in message for marker in _MODEL_NOT_RUN_MARKERS):
                return (
                    jsonify(
                        {
                            "error": message,
                            "error_type": "model_not_run",
                            "model": _extract_model_not_run_name(message),
                        }
                    ),
                    422,
                )
            Logger.instance().error(f"execute-draft: query build failed: {e}")
            return jsonify({"error": message}), 400

        # A dynamic insight (references a real Input) has pre_query=None — its
        # query carries unfilled ${input} placeholders the server can't bake, so
        # tell the client to fall back to its own DuckDB sample lane.
        if query_info.pre_query is None:
            return (
                jsonify(
                    {
                        "error": "Insight query is dynamic (references an input); cannot execute server-side",
                        "error_type": "requires_client_lane",
                    }
                ),
                409,
            )

        try:
            source = insight.get_dependent_source(dag, run_output_dir)
        except Exception as e:
            # No resolvable source, or the single-source assumption is violated.
            return jsonify({"error": str(e)}), 400

        try:
            # No output_dir/name → pure in-memory execution, no parquet written.
            result = execute_and_get_result(source=source, sql=query_info.pre_query)
        except Exception as e:
            message = str(e)
            Logger.instance().error(f"execute-draft: source execution failed: {e}")
            return jsonify({"error": message}), 400

        insight_type = None
        if insight.props is not None and insight.props.type is not None:
            insight_type = insight.props.type.value

        try:
            dependent_models = insight.get_all_dependent_models(dag)
        except Exception:
            dependent_models = []

        return (
            jsonify(
                {
                    # columns, rows, row_count, execution_time_ms — rows are the
                    # FINAL chart rows.
                    **result,
                    "props_mapping": query_info.props_mapping,
                    "static_props": query_info.static_props,
                    "props_slices": query_info.props_slices,
                    "split_key": query_info.split_key,
                    "type": insight_type,
                    "models": [
                        {"name": m.name, "name_hash": m.name_hash()} for m in dependent_models
                    ],
                }
            ),
            200,
        )
