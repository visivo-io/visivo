"""Run endpoints + the run-on-save hook for local serve.

Implements the cloud run contract locally so the viewer's run-poller
(``runStore.pollRuns`` -> ``GET /api/projects/<id>/run/``) and Runs view work
unchanged, and wires "run changes on save": a save/delete debounce-triggers a
run that rebuilds the changed slice into ``main`` — but ONLY when the edit
actually changed the DATA, the same data-affecting gate core uses
(``apps/deploys/services/auto_run`` / ``data_fingerprint``).

Each edit's data fingerprint (see ``visivo.server.hash.data_fingerprint``) is
snapshotted before the write and compared after. A presentation-only edit — an
insight ``type``/color, a chart's plain layout/legend, reordering a dashboard —
leaves the fingerprint identical, so no run fires and the viewer just re-renders
from the refreshed config over the already-built data. A change that moves the
fingerprint — a ``model.sql`` / source edit (whole config), an insight query, or
an inline ``?{ }`` layout query on a chart/table (visivo pushes it into the
insight's query) — triggers a run. A delete rebuilds only when the removed
resource had built data (a data-producing type, or a presentation resource that
carried a ``?{ }`` query).

Local serve has a single project and an in-memory ``RunManager``; the
``<project_id>`` path token is accepted for URL parity but not used to scope.
"""

import re
from urllib.parse import unquote

from flask import g, jsonify, request

from visivo.logger.logger import Logger
from visivo.server.hash.data_fingerprint import data_fingerprint
from visivo.server.jobs.save_run_executor import request_run, run_now
from visivo.server.user_config import AUTOMATIC, get_run_trigger

# URL segment -> (manager attr, fingerprint mode, data_producing). Public so the
# resource→data-mode mapping is easy to find. Mirrors core's per-type DATA_MODE /
# DATA_PRODUCING (``apps/deploys/models.py``):
#   * "whole" — SQL/connection/input resources: any config field is data.
#   * "query" — visualization resources: only query leaves matter. An insight is
#     data-producing (its ${ref} deps + ?{ } queries feed its job); a chart /
#     table / markdown / dashboard is NOT — only an inline ?{ } layout query
#     counts (a ${ } there just reads already-built data), so a color / legend /
#     layout edit leaves the fingerprint alone, while a ?{ } layout query that
#     visivo folds into the insight's query does move it.
RESOURCE_META = {
    "sources": ("source_manager", "whole", True),
    "models": ("model_manager", "whole", True),
    "dimensions": ("dimension_manager", "whole", True),
    "metrics": ("metric_manager", "whole", True),
    "relations": ("relation_manager", "whole", True),
    "inputs": ("input_manager", "whole", True),
    "insights": ("insight_manager", "query", True),
    "charts": ("chart_manager", "query", False),
    "tables": ("table_manager", "query", False),
    "markdowns": ("markdown_manager", "query", False),
    "dashboards": ("dashboard_manager", "query", False),
}

# URL segment -> the type name the viewer renders (and the one core's
# ``unbuilt_changes`` emits). Every segment is the plural of its type, so this is
# derived rather than a second list to keep in sync.
RESOURCE_TYPE_NAMES = {segment: segment[:-1] for segment in RESOURCE_META}

# Detail routes (``/api/<segment>/<name>/``) for the mapped resources — derived
# from RESOURCE_META so the two can't drift. Longest-first alternation so a
# segment can never be shadowed by another that is a prefix of it.
_RESOURCE_ROUTE_RE = re.compile(
    r"^/api/("
    + "|".join(re.escape(s) for s in sorted(RESOURCE_META, key=len, reverse=True))
    + r")/([^/]+)/$"
)


def _resource_from_path(path):
    """``(segment, name)`` for a resource detail route, else ``None``."""
    match = _RESOURCE_ROUTE_RE.match(path)
    if not match:
        return None
    return match.group(1), unquote(match.group(2))


def _resource_fingerprint(flask_app, segment, name, *, deleted=False):
    """The data fingerprint of a resource's CURRENT (cached-over-published)
    config — or of its deletion when ``deleted``. ``model_dump`` preserves the
    ``?{ }`` / ``${ }`` tokens the query-leaf detection reads."""
    manager_attr, mode, data_producing = RESOURCE_META[segment]
    manager = getattr(flask_app, manager_attr, None)
    if manager is None:
        return None
    obj = None if deleted else manager.get(name)
    config = (
        obj.model_dump(mode="json", exclude_none=True, exclude={"file_path", "path"})
        if obj is not None
        else None
    )
    return data_fingerprint(mode, config, deleted=deleted, data_producing=data_producing)


def register_run_views(app, flask_app, output_dir):
    @app.before_request
    def snapshot_data_fingerprint():
        # Snapshot the pre-edit data fingerprint so the after-hook can tell a data
        # change from a presentation-only edit. Never let it break a request.
        g._presave_data_fingerprint = None
        try:
            if request.method in ("POST", "DELETE"):
                resource = _resource_from_path(request.path)
                if resource:
                    g._presave_data_fingerprint = _resource_fingerprint(flask_app, *resource)
        except Exception as e:
            Logger.instance().error(f"run-on-save presave hook error: {str(e)}")

    @app.after_request
    def run_on_save(response):
        try:
            if request.method in ("POST", "DELETE") and response.status_code < 400:
                resource = _resource_from_path(request.path)
                if resource:
                    segment, name = resource
                    deleted = request.method == "DELETE"
                    after = _resource_fingerprint(flask_app, segment, name, deleted=deleted)
                    if after != getattr(g, "_presave_data_fingerprint", None):
                        # Stage the change either way: the staged set is what the
                        # Run view lists and what the Run button builds, so it has
                        # to be recorded whether or not a run fires now.
                        flask_app.staged_manager.record(
                            RESOURCE_TYPE_NAMES[segment],
                            name,
                            after,
                            status="deleted" if deleted else "modified",
                        )
                        if get_run_trigger() == AUTOMATIC:
                            request_run(flask_app, [name])
        except Exception as e:  # never let the hook break a save response
            Logger.instance().error(f"run-on-save hook error: {str(e)}")
        return response

    @app.route("/api/projects/<project_id>/run/", methods=["GET"])
    def list_runs(project_id):
        """Newest-first runs, in the cloud ``RunSerializer`` shape.

        Deliberately still a bare array, matching cloud: the staged set rides on
        ``/api/projects/<id>/changes/`` instead. Changing this response shape
        would break any viewer older than the server, and the viewer ships on its
        own schedule at both ends (a vendored release tag in cloud, whenever the
        user upgrades locally).
        """
        try:
            return jsonify(flask_app.run_manager.list())
        except Exception as e:
            Logger.instance().error(f"Error listing runs: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/projects/<project_id>/run/", methods=["POST"])
    def trigger_run(project_id):
        """The Run button. Mirrors the cloud contract, including the distinction
        between an absent ``dag_filter`` (build what's staged) and an explicit
        empty one (rebuild everything — the Run-all escape hatch, and the only
        recovery when outputs are missing but the fingerprints say built)."""
        try:
            active = [
                run for run in flask_app.run_manager.list() if run["state"] in ("queued", "running")
            ]
            if active:
                return (
                    jsonify({"action": "run_in_progress", "run": active[0]}),
                    409,
                )

            body = request.get_json(silent=True) or {}
            if "dag_filter" in body:
                dag_filter = body.get("dag_filter") or ""
            else:
                dag_filter = flask_app.staged_manager.dag_filter()
            run = run_now(flask_app, dag_filter)
            return jsonify(run.to_dict()), 201
        except Exception as e:
            Logger.instance().error(f"Error triggering run: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/runs/<run_id>/logs/", methods=["GET"])
    def run_logs(run_id):
        """``{state, logs, error_json}`` for the Runs view's expandable log."""
        run = flask_app.run_manager.get(run_id)
        if run is None:
            return jsonify({"error": "Run not found"}), 404
        return jsonify({"state": run.state.value, "logs": run.logs, "error_json": run.error_json})
