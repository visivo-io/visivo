"""Shared helpers for the two stateless draft-insight endpoints (Explore 2.0):
``/api/insight-compile-draft/`` (compile only) and ``/api/insight-execute-draft/``
(compile + execute against the full source). Both parse the SAME request body,
seed FieldResolver the SAME way from client-supplied ``model_schemas``, and map
the SAME "never-run scratch model" build failure to the SAME 422 — so that logic
lives here once rather than being duplicated (and one endpoint reaching across
the module boundary for the other's private symbols).
"""

import re

from flask import jsonify


def parse_draft_request(data):
    """Validate the shared draft-endpoint request body.

    Returns ``(fields, None)`` on success, where ``fields`` is a dict with
    ``insight_config``, ``draft_models``, ``draft_metrics``, ``draft_dimensions``,
    ``model_schemas``; or ``(None, (response, status))`` for a clean 400 when the
    body, the ``insight`` object, or ``model_schemas`` is the wrong shape.
    """
    if not isinstance(data, dict):
        return None, (jsonify({"error": "Request body must be a JSON object"}), 400)

    insight_config = data.get("insight")
    if not isinstance(insight_config, dict) or not insight_config.get("name"):
        return None, (
            jsonify({"error": "'insight' (an object with at least a 'name') is required"}),
            400,
        )

    # `data.get(...) or {}` only defaults on falsy/missing; a truthy non-dict
    # (e.g. a JSON list) would otherwise slip through to `.items()` and 500.
    model_schemas = data.get("model_schemas") or {}
    if not isinstance(model_schemas, dict):
        return None, (jsonify({"error": "'model_schemas' must be a JSON object"}), 400)

    return {
        "insight_config": insight_config,
        "draft_models": data.get("draft_models") or [],
        "draft_metrics": data.get("draft_metrics") or [],
        "draft_dimensions": data.get("draft_dimensions") or [],
        "model_schemas": model_schemas,
    }, None


def build_schema_overrides(dag, model_schemas):
    """Client-supplied ``{modelName: {column: type}}`` → the
    ``{modelName: {model_hash: {column: type}}}`` shape FieldResolver's schema
    cache expects (a scratch model with no server-side ``schemas/<model>/
    schema.json`` yet — e.g. one the client ran through the SQL/results lane and
    already knows the columns for). Skips any entry whose columns aren't a dict
    or whose model isn't a descendant of this insight's DAG.
    """
    schema_overrides = {}
    for model_name, columns in (model_schemas or {}).items():
        if not isinstance(columns, dict):
            continue
        try:
            model_node = dag.get_descendant_by_name(model_name)
        except Exception:
            continue
        model_hash = getattr(model_node, "name_hash", lambda: None)()
        if model_hash:
            schema_overrides[model_name] = {model_hash: columns}
    return schema_overrides


# FieldResolver has TWO independent missing-schema code paths with two different
# exception shapes (found via direct testing): the SQLGlot-AST path
# (`_qualify_expression`) raises `ValueError("Schema not found for model
# '<name>'. Has the model been executed yet?")`; the dynamic/raw-string path
# (`resolve_ref`) raises a bare `Exception("Missing schema for model: <name>.")`.
# Both mean the same thing — a never-run scratch model — so both map to the same
# graceful 422. The patterns pick the model name back out of our OWN error
# string (not SQL parsing) so the response can name it for the "run <model>
# first" UI state.
MODEL_NOT_RUN_MARKERS = ("Has the model been executed yet?", "Missing schema for model")
_MODEL_NAME_PATTERNS = (
    re.compile(r"Schema not found for model '([^']+)'"),
    re.compile(r"Missing schema for model:\s*([^.]+)\."),
)


def is_model_not_run_error(message):
    return any(marker in (message or "") for marker in MODEL_NOT_RUN_MARKERS)


def extract_model_not_run_name(message):
    for pattern in _MODEL_NAME_PATTERNS:
        match = pattern.search(message or "")
        if match:
            return match.group(1).strip()
    return None


def diagnostic_fields(exc):
    """Structured ``{"diagnostic": {...}}`` for a build failure that carries a
    :class:`~visivo.models.diagnostic.Diagnostic`, ``{}`` for one that doesn't.

    Additive by design: the 400 body keeps its ``error`` string exactly as it
    was, and a client that doesn't know about diagnostics never sees a
    difference. Producers today: ``PositionalAxisTypeError`` (WB9 / S5-14).
    """
    diagnostic = getattr(exc, "diagnostic", None)
    if diagnostic is None or not hasattr(diagnostic, "model_dump"):
        return {}
    return {"diagnostic": diagnostic.model_dump(mode="json", exclude_none=True)}
