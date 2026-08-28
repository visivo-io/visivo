"""Stateless insight compile-draft endpoint (Explore 2.0 Phase 4) — S2's
resolved design (specs/plan/explorer-workspace-unification/research/
s2-draft-rendering-decision.md).

``POST /api/insight-compile-draft/`` — deliberately NOT nested under
``/api/insights/``: that segment is a run-on-save-monitored resource
(``run_views.py``'s ``RESOURCE_META``/``_RESOURCE_ROUTE_RE`` matches ANY
``/api/insights/<anything>/`` as a resource-detail route), so a sub-route
there would risk tripping the run-on-save hook for a "resource" literally
named ``compile-draft``. This route lives at its own top-level segment
instead, mirroring ``/api/model-query-jobs/``'s and ``/api/explorer/diff/``'s
existing precedent of siblings that are NOT in ``RESOURCE_META``.

Synchronous — like ``/api/explorer/diff/``, no job manager: this never
executes anything against a real source or writes to disk, so there's nothing
to poll. Builds the draft overlay DAG (``draft_overlay.py``), resolves query
text via ``Insight.get_query_info(..., force_dynamic=True)``, and stops.

Response contract:
  200 { post_query, pre_query: null, props_mapping, static_props,
        props_slices, split_key, type, models: [{name, name_hash}] }
  400 { error, diagnostic? } — malformed body / draft Pydantic validation /
        ref-resolution / SQLGlot failure. `diagnostic` is the structured
        `Diagnostic` (visivo/models/diagnostic.py) when the build failure
        carried one (e.g. a positional axis bound to a STRUCT, WB9/S5-14);
        absent otherwise, so `error` stays the only field a client needs.
  422 { error, error_type: "model_not_run", model: str|null } — a raw-column
        ref names a scratch model with no schema (client never sent
        `model_schemas` for it, and it has never been run for real either) —
        the graceful "run the query first" state (S2's one known sub-gap).
        `model` is the extracted model name when the message shape allows it.
"""

from flask import request, jsonify

from visivo.constants import DEFAULT_RUN_ID
from visivo.logger.logger import Logger
from visivo.query.insight.draft_overlay import build_draft_overlay, DraftOverlayError
from visivo.server.views.insight_draft_common import (
    parse_draft_request,
    build_schema_overrides,
    diagnostic_fields,
    is_model_not_run_error,
    extract_model_not_run_name,
)


def register_insight_compile_views(app, flask_app, output_dir):
    @app.route("/api/insight-compile-draft/", methods=["POST"])
    def compile_draft_insight():
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
            Logger.instance().error(f"compile-draft: overlay build failed: {e}")
            return jsonify({"error": str(e)}), 400

        schema_overrides = build_schema_overrides(dag, model_schemas)

        run_output_dir = f"{output_dir}/{DEFAULT_RUN_ID}"
        try:
            query_info = insight.get_query_info(
                dag,
                run_output_dir,
                schema_overrides=schema_overrides or None,
                force_dynamic=True,
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
            Logger.instance().error(f"compile-draft: query build failed: {e}")
            return jsonify({"error": message, **diagnostic_fields(e)}), 400

        try:
            dependent_models = insight.get_all_dependent_models(dag)
        except Exception:
            dependent_models = []

        insight_type = None
        if insight.props is not None and insight.props.type is not None:
            insight_type = insight.props.type.value

        return (
            jsonify(
                {
                    "post_query": query_info.post_query,
                    "pre_query": None,
                    "props_mapping": query_info.props_mapping,
                    "static_props": query_info.static_props,
                    "props_slices": query_info.props_slices,
                    "split_key": query_info.split_key,
                    # Explore 2.0 Phase 3: the client reads this to pick the
                    # preview lane — False → project instantly client-side over
                    # the fetched sample; True → the query aggregates/windows/
                    # splits/joins, so it must execute against the FULL source
                    # (POST /api/insight-execute-draft/) to be correct. Computed
                    # dialect-independently, so this force_dynamic=True build
                    # already carries it.
                    "requires_full_source": query_info.requires_full_source,
                    "type": insight_type,
                    "models": [
                        {"name": m.name, "name_hash": m.name_hash()} for m in dependent_models
                    ],
                }
            ),
            200,
        )
