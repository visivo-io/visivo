"""Draft-insight helpers that are not about HTTP.

Split out of ``visivo.server.views.insight_draft_common`` because a SERVICE
imported them, and importing anything under ``visivo.server.views`` runs that
package's ``__init__``, which imports every view — several of which import the
agent package. That made a cycle:

    agent.loop -> agent.tools -> agent.data_tools
      -> server.services.draft_insight -> server.views.__init__
      -> server.views.agent_views -> agent.runner -> agent.loop

``visivo serve`` never noticed, because it imports the views first. The runner
imports ``agent.loop`` directly, so for it the agent could not start at all.

Nothing here touches Flask. The view module re-exports these names, so callers
there are unchanged.
"""

import re


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
