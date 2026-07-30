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
from visivo.jobs.run_model_data_job import execute_and_get_result
from visivo.jobs.utils import get_source_for_model
from visivo.query.insight.draft_overlay import build_draft_overlay, DraftOverlayError
from visivo.server.views.insight_draft_common import (
    parse_draft_request,
    build_schema_overrides,
    is_model_not_run_error,
    extract_model_not_run_name,
)


def register_insight_execute_views(app, flask_app, output_dir):
    @app.route("/api/insight-execute-draft/", methods=["POST"])
    def execute_draft_insight():
        fields, error = parse_draft_request(request.get_json(silent=True))
        if error:
            return error
        insight_config = fields["insight_config"]
        draft_models = fields["draft_models"]
        draft_metrics = fields["draft_metrics"]
        draft_dimensions = fields["draft_dimensions"]
        model_schemas = fields["model_schemas"]

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

        schema_overrides = build_schema_overrides(dag, model_schemas)
        run_output_dir = f"{output_dir}/{DEFAULT_RUN_ID}"

        # Reject a genuinely MULTI-SOURCE insight up front (before the query
        # build). A relation-join insight spans >1 model and the built pre_query
        # embeds every model's CTE, so all dependent models must resolve to ONE
        # source for a single source.read_sql to be correct. get_dependent_source
        # picks an ARBITRARY model's source rather than enforcing this, so a
        # two-source insight would otherwise execute against one source and
        # surface a raw "table does not exist" driver error for the other's
        # tables. `dependent_models` is reused for the response payload below.
        try:
            dependent_models = insight.get_all_dependent_models(dag)
            source_names = {
                src.name
                for src in (get_source_for_model(m, dag, run_output_dir) for m in dependent_models)
                if src
            }
        except Exception as e:
            return jsonify({"error": str(e)}), 400
        if len(source_names) > 1:
            return (
                jsonify(
                    {
                        "error": (
                            f"Insight '{insight.name}' references models from more than one "
                            f"source ({', '.join(sorted(source_names))}) and cannot be "
                            "previewed server-side."
                        ),
                        "error_type": "multi_source",
                    }
                ),
                400,
            )

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
            if is_model_not_run_error(message):
                return (
                    jsonify(
                        {
                            "error": message,
                            "error_type": "model_not_run",
                            "model": extract_model_not_run_name(message),
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

        # `dependent_models` and the single-source guarantee were established
        # above, so this resolves the one shared source for execution.
        try:
            source = insight.get_dependent_source(dag, run_output_dir)
        except Exception as e:
            # No dependent models, or no resolvable source for them.
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

        # `dependent_models` is already resolved above (the multi-source check).
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
