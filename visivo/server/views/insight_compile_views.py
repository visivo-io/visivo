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
  400 { error } — malformed body / draft Pydantic validation / ref-resolution
        / SQLGlot failure
  422 { error, error_type: "model_not_run", model: str|null } — a raw-column
        ref names a scratch model with no schema (client never sent
        `model_schemas` for it, and it has never been run for real either) —
        the graceful "run the query first" state (S2's one known sub-gap).
        `model` is the extracted model name when the message shape allows it.
"""

import re

from flask import request, jsonify

from visivo.constants import DEFAULT_RUN_ID
from visivo.logger.logger import Logger
from visivo.query.insight.draft_overlay import build_draft_overlay, DraftOverlayError

# FieldResolver has TWO independent missing-schema code paths with two
# different exception shapes (found via direct testing, not assumption): the
# SQLGlot-AST path (`_qualify_expression`) raises `ValueError("Schema not
# found for model '<name>'. Has the model been executed yet?")`; the dynamic/
# raw-string-assembly path this endpoint ALWAYS takes (`force_dynamic=True`,
# `resolve_ref`) raises a bare `Exception("Missing schema for model:
# <name>.")` instead. Both mean the exact same thing — a never-run scratch
# model — so both markers map to the same graceful 422. The regexes below
# extract the model name from EACH message shape (not SQL parsing — just
# picking the name back out of our own error string) so the response can name
# it for the "run <model> first" UI state.
_MODEL_NOT_RUN_MARKERS = ("Has the model been executed yet?", "Missing schema for model")
_MODEL_NAME_PATTERNS = (
    re.compile(r"Schema not found for model '([^']+)'"),
    re.compile(r"Missing schema for model:\s*([^.]+)\."),
)


def _extract_model_not_run_name(message: str):
    for pattern in _MODEL_NAME_PATTERNS:
        match = pattern.search(message)
        if match:
            return match.group(1).strip()
    return None


def register_insight_compile_views(app, flask_app, output_dir):
    @app.route("/api/insight-compile-draft/", methods=["POST"])
    def compile_draft_insight():
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
            Logger.instance().error(f"compile-draft: overlay build failed: {e}")
            return jsonify({"error": str(e)}), 400

        # Client-supplied schema override for a scratch model that has no
        # server-side schemas/<model>/schema.json yet — e.g. the client ran it
        # once through the SQL/results lane (`/api/model-query-jobs/`) and
        # already knows its columns. Keyed by model name; FieldResolver's
        # `_schema_cache` (which this seeds) is itself keyed by model name and
        # expects the SAME shape a real schema.json read returns:
        # `{model_hash: {column: type}}`.
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
                force_dynamic=True,
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
            Logger.instance().error(f"compile-draft: query build failed: {e}")
            return jsonify({"error": message}), 400

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
                    "type": insight_type,
                    "models": [
                        {"name": m.name, "name_hash": m.name_hash()} for m in dependent_models
                    ],
                }
            ),
            200,
        )
