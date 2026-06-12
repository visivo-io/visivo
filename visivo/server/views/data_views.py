import datetime
import json
import os
import re
from flask import jsonify, request, send_file, send_from_directory
from visivo.utils import SCHEMA_FILE, VIEWER_PATH
from visivo.telemetry.config import is_telemetry_enabled


def register_data_views(app, flask_app, output_dir):
    @app.route("/api/explorer/")
    def explorer_api():
        if os.path.exists(f"{output_dir}/explorer.json"):
            with open(f"{output_dir}/explorer.json", "r") as f:
                return json.load(f)
        else:
            return json.dumps({})

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
        project_data = json.loads(flask_app._project_json)
        return {
            "id": "id",
            "name": flask_app._project.name,
            "project_json": project_data,
            "config": project_data.get("defaults", {}),
            "created_at": datetime.datetime.now().isoformat(),
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

        html = html.replace("</head>", f"{scripts}</head>")

        return html
