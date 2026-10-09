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

from visivo.logger.logger import Logger
from visivo.server.services.draft_insight import DraftInsightError, execute_draft_insight
from visivo.server.views.insight_draft_common import parse_draft_request

from visivo.server.views.temporal_json import isoformat_temporal_values


def register_insight_execute_views(app, flask_app, output_dir):
    @app.route("/api/insight-execute-draft/", methods=["POST"])
    def execute_draft_insight_view():
        fields, error = parse_draft_request(request.get_json(silent=True))
        if error:
            return error
        try:
            result = execute_draft_insight(
                flask_app,
                output_dir,
                fields["insight_config"],
                draft_models=fields["draft_models"],
                draft_metrics=fields["draft_metrics"],
                draft_dimensions=fields["draft_dimensions"],
                model_schemas=fields["model_schemas"],
            )
        except DraftInsightError as refused:
            return jsonify(refused.payload), refused.status
        # rows are the FINAL chart rows; ISO-8601 so the client's DuckDB lane
        # reads them without coercion.
        return (
            jsonify({**result, "rows": isoformat_temporal_values(result.get("rows") or [])}),
            200,
        )
