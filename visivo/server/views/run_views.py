"""Run endpoints + the run-on-save hook for local serve.

Implements the cloud run contract locally so the viewer's run-poller
(``runStore.pollRuns`` -> ``GET /api/projects/<id>/run/``) and Runs view work
unchanged, and wires "run changes on save": a save/delete of a DATA-producing
resource debounce-triggers a run that rebuilds the changed slice into ``main``.
Presentation resources (charts/tables/markdowns/dashboards) are read-only
consumers — the viewer re-renders them from their refreshed config + the
already-built data, so they don't trigger a run (mirrors the cloud).

A save only runs the jobs when it actually changed the DATA — the same
data-affecting gate core uses (``apps/deploys/services/auto_run`` /
``data_fingerprint``). Each save's data fingerprint (see ``data_fingerprint``)
is snapshotted before the write and compared after: a presentation-only edit
(an insight ``type``/color, whose query leaves are unchanged) leaves the
fingerprint identical, so no run fires and the viewer just re-renders from the
refreshed config over the already-built data. A ``model.sql`` / query / source
edit moves the fingerprint, so a run rebuilds it. Deletes always rebuild (the
artifact goes away, so consumers must recompute).

Local serve has a single project and an in-memory ``RunManager``; the
``<project_id>`` path token is accepted for URL parity but not used to scope.
"""

import re
from urllib.parse import unquote

from flask import g, jsonify, request

from visivo.logger.logger import Logger
from visivo.server.jobs.data_fingerprint import data_fingerprint
from visivo.server.jobs.save_run_executor import request_run

# Detail routes whose save/delete changes a model/insight/input artifact. Every
# one is data-producing, so a delete always forces a rebuild; the mode below
# decides what counts as a data change on a save.
_DATA_RESOURCE_RE = re.compile(
    r"^/api/("
    r"sources|models|csv-script-models|local-merge-models|"
    r"insights|inputs|dimensions|metrics|relations"
    r")/([^/]+)/$"
)

# URL segment -> (manager attr, fingerprint mode). Mirrors core's per-type
# DATA_MODE (``apps/deploys/models.py``): the SQL/connection/input resources
# hash their whole config ("whole" — any field is data); the insight hashes only
# its query leaves ("query"), so a type/color edit leaves the fingerprint alone.
_RESOURCE_META = {
    "sources": ("source_manager", "whole"),
    "models": ("model_manager", "whole"),
    "csv-script-models": ("csv_script_model_manager", "whole"),
    "local-merge-models": ("local_merge_model_manager", "whole"),
    "dimensions": ("dimension_manager", "whole"),
    "metrics": ("metric_manager", "whole"),
    "relations": ("relation_manager", "whole"),
    "inputs": ("input_manager", "whole"),
    "insights": ("insight_manager", "query"),
}


def _resource_from_path(path):
    """``(segment, name)`` for a data-resource detail route, else ``None``."""
    match = _DATA_RESOURCE_RE.match(path)
    if not match:
        return None
    return match.group(1), unquote(match.group(2))


def _resource_fingerprint(flask_app, segment, name):
    """The data fingerprint of a resource's CURRENT (cached-over-published)
    config, or of "nothing" when it doesn't exist. ``model_dump`` preserves the
    ``?{ }`` / ``${ }`` tokens the query-leaf detection reads."""
    manager_attr, mode = _RESOURCE_META[segment]
    manager = getattr(flask_app, manager_attr, None)
    if manager is None:
        return None
    obj = manager.get(name)
    config = (
        obj.model_dump(mode="json", exclude_none=True, exclude={"file_path", "path"})
        if obj is not None
        else None
    )
    return data_fingerprint(mode, config, data_producing=True)


def register_run_views(app, flask_app, output_dir):
    @app.before_request
    def snapshot_data_fingerprint():
        # Capture the pre-save data fingerprint so the after-hook can tell a data
        # change from a presentation-only edit. Never let it break a request.
        g._presave_data_fingerprint = None
        try:
            if request.method == "POST":
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
                    if request.method == "DELETE":
                        # The built artifact goes away, so consumers must rebuild.
                        request_run(flask_app, [name])
                    else:
                        after = _resource_fingerprint(flask_app, segment, name)
                        if after != getattr(g, "_presave_data_fingerprint", None):
                            request_run(flask_app, [name])
        except Exception as e:  # never let the hook break a save response
            Logger.instance().error(f"run-on-save hook error: {str(e)}")
        return response

    @app.route("/api/projects/<project_id>/run/", methods=["GET"])
    def list_runs(project_id):
        """Newest-first runs, in the cloud ``RunSerializer`` shape."""
        try:
            return jsonify(flask_app.run_manager.list())
        except Exception as e:
            Logger.instance().error(f"Error listing runs: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/runs/<run_id>/logs/", methods=["GET"])
    def run_logs(run_id):
        """``{state, logs, error_json}`` for the Runs view's expandable log."""
        run = flask_app.run_manager.get(run_id)
        if run is None:
            return jsonify({"error": "Run not found"}), 404
        return jsonify({"state": run.state.value, "logs": run.logs, "error_json": run.error_json})
