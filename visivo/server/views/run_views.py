"""Run endpoints + the run-on-save hook for local serve.

Implements the cloud run contract locally so the viewer's run-poller
(``runStore.pollRuns`` -> ``GET /api/projects/<id>/run/``) and Runs view work
unchanged, and wires "run changes on save": a successful edit/delete of a
DATA-producing resource debounce-triggers a run that rebuilds the changed slice
into ``main``. Presentation resources (charts/tables/markdowns/dashboards) are
read-only consumers — the viewer re-renders them from their refreshed config +
the already-built data, so they don't trigger a run (mirrors the cloud).

Local serve has a single project and an in-memory ``RunManager``; the
``<project_id>`` path token is accepted for URL parity but not used to scope.
"""

import re
from urllib.parse import unquote

from flask import jsonify, request

from visivo.logger.logger import Logger
from visivo.server.jobs.save_run_executor import request_run

# Detail routes whose save/delete changes a model/insight/input artifact.
_DATA_RESOURCE_RE = re.compile(
    r"^/api/("
    r"sources|models|csv-script-models|local-merge-models|"
    r"insights|inputs|dimensions|metrics|relations"
    r")/([^/]+)/$"
)


def register_run_views(app, flask_app, output_dir):
    @app.after_request
    def run_on_save(response):
        try:
            if request.method in ("POST", "DELETE") and response.status_code < 400:
                match = _DATA_RESOURCE_RE.match(request.path)
                if match:
                    request_run(flask_app, [unquote(match.group(2))])
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
        return jsonify(
            {"state": run.state.value, "logs": run.logs, "error_json": run.error_json}
        )
