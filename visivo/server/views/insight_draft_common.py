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


# Re-exported so the views that already import them from here are unchanged.
# They live in a service now because a service needs them too, and a service
# importing a view module is what closed the import cycle described there.
from visivo.server.services.insight_draft_helpers import (  # noqa: E402,F401
    MODEL_NOT_RUN_MARKERS,
    build_schema_overrides,
    extract_model_not_run_name,
    is_model_not_run_error,
)
