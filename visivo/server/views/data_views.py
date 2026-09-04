import datetime
import json
import os
import re
from flask import jsonify, request, send_file, send_from_directory
from visivo.utils import SCHEMA_FILE, VIEWER_PATH
from visivo.telemetry import first_run
from visivo.telemetry.config import is_telemetry_enabled


def register_data_views(app, flask_app, output_dir):
    @app.route("/api/schema/")
    def schema_api():
        if os.path.exists(SCHEMA_FILE):
            return send_file(SCHEMA_FILE)
        else:
            return (
                jsonify({"message": f"Schema file not found: {SCHEMA_FILE}"}),
                404,
            )

    @app.route("/api/error/")
    def error_api():
        if os.path.exists(f"{output_dir}/error.json"):
            with open(f"{output_dir}/error.json", "r") as error_file:
                return error_file.read()
        else:
            return json.dumps({})

    @app.route("/api/project/")
    def projects_api():
        # The canonical whole-project envelope: {id, name, status, config}.
        # It used to carry the entire dereferenced project as ``project_json``
        # and every consumer dug through that blob. The fields below are what
        # they actually wanted — ``config.defaults`` nested the way the viewer
        # reads it (it was flat here, so the nested read silently missed and
        # fell through to the blob), plus the two counts and the directory the
        # onboarding flow needs. Resource lists come from their own endpoints.
        project_data = json.loads(flask_app._project_json)
        return {
            "id": "id",
            "name": flask_app._project.name,
            "project_dir": flask_app._project.project_dir or "",
            "config": {"defaults": project_data.get("defaults", {})},
            "dashboard_count": len(project_data.get("dashboards") or []),
            "source_count": len(project_data.get("sources") or []),
            "created_at": datetime.datetime.now().isoformat(),
            # Local serve is always an editable draft. This is the one signal
            # the viewer's run-poller (useRunPolling) gates on, so reporting it
            # turns on run-on-save polling + the Runs view locally. (Other
            # "draft" UI keys on capabilities.is_draft, not project.status.)
            "status": "draft",
        }

    @app.route("/api/project_history/")
    def project_history_api():
        return [
            {
                "id": "id",
                "created_at": datetime.datetime.now().isoformat(),
            }
        ]

    @app.route("/", defaults={"path": "index.html"})
    @app.route("/<path:path>")
    def viewer_file(path):
        regex = r"\S*(\.png|\.ico|\.js|\.css|\.wasm|\.webmanifest|\.js\.map|\.css\.map)$"
        if re.match(regex, path):
            return send_from_directory(VIEWER_PATH, path)

        # For HTML responses, read the file and inject our scripts
        with open(os.path.join(VIEWER_PATH, "index.html"), "r") as f:
            html = f.read()

        # Add socket.io client and our hot reload script
        scripts = """
            <script src="https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.0.1/socket.io.js"></script>
            <script src="/hot-reload.js"></script>
        """

        # Honor the CLI/local telemetry opt-out: when telemetry is disabled
        # (env VISIVO_TELEMETRY_DISABLED, project defaults, or global config),
        # set the window flag the viewer's PostHog client checks so it never
        # initializes or captures. When enabled, inject nothing extra so the
        # viewer's default-on telemetry runs. Cloud (core) never serves through
        # here, so it has no flag and stays always-on.
        project_defaults = getattr(flask_app._project, "defaults", None)
        if not is_telemetry_enabled(project_defaults):
            scripts = "<script>window.__VISIVO_TELEMETRY_DISABLED=true</script>" + scripts
        else:
            # Step 1 of the time-to-value ladder: serving this HTML is the first
            # moment the product is in front of the user. Fires once per machine —
            # the ledger in ~/.visivo/first_run.json is the guard, not this request.
            first_run.mark_step(
                first_run.STEP_FIRST_RUN_LAUNCHED, project_defaults=project_defaults
            )
            journey = first_run.viewer_journey_context(project_defaults=project_defaults)
            if journey:
                # `</` is split so no value can terminate the <script> element early.
                journey_json = json.dumps(journey).replace("</", "<\\/")
                scripts = f"<script>window.__VISIVO_FIRST_RUN={journey_json}</script>" + scripts

        html = html.replace("</head>", f"{scripts}</head>")

        return html
