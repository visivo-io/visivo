"""User preferences — the local half of ``GET``/``PUT /api/me/preferences/``.

Cloud stores these on the User row; local serve stores them in
``~/.visivo/config.yml``, beside ``telemetry_enabled``. Same endpoint, same
response shape, different defaults — which is exactly how the shared viewer
avoids ever asking "am I running against Flask or Django?". It renders whichever
mode the server reports.
"""

from flask import jsonify, request

from visivo.logger.logger import Logger
from visivo.server.user_config import RUN_TRIGGERS, get_run_trigger, set_run_trigger


def register_preferences_views(app, flask_app, output_dir):
    @app.route("/api/me/preferences/", methods=["GET"])
    def get_preferences():
        return jsonify({"run_trigger": get_run_trigger()})

    @app.route("/api/me/preferences/", methods=["PUT"])
    def put_preferences():
        body = request.get_json(silent=True) or {}
        value = body.get("run_trigger")
        if value is not None:
            if value not in RUN_TRIGGERS:
                return (
                    jsonify({"run_trigger": [f"Must be one of {', '.join(RUN_TRIGGERS)}."]}),
                    400,
                )
            if not set_run_trigger(value):
                # An unwritable home directory shouldn't 500 the editor, but it
                # must not silently report success either — the setting would
                # revert on restart with no explanation.
                Logger.instance().error("Could not persist run_trigger preference")
                return jsonify({"error": "Could not write ~/.visivo/config.yml"}), 500
        return jsonify({"run_trigger": get_run_trigger()})
