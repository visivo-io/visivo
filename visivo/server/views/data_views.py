import datetime
import json
import os
import re
from flask import jsonify, send_file, send_from_directory
from visivo.logger.logger import Logger
from visivo.utils import SCHEMA_FILE, VIEWER_PATH


def register_data_views(app, flask_app, output_dir):
    @app.route("/data/<trace_name>/data.json")
    def serve_trace_data(trace_name):
        try:
            trace_dir = os.path.join(output_dir, "traces", trace_name)
            if not os.path.exists(trace_dir):
                return (
                    jsonify({"message": f"Trace directory not found: {trace_name}"}),
                    404,
                )
            return send_from_directory(trace_dir, "data.json")
        except Exception as e:
            Logger.instance().error(f"Error serving trace data: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/data/explorer.json")
    def explorer():
        if os.path.exists(f"{output_dir}/explorer.json"):
            with open(f"{output_dir}/explorer.json", "r") as f:
                return json.load(f)
        else:
            return json.dumps({})

    @app.route("/data/schema.json")
    def schema():
        if os.path.exists(SCHEMA_FILE):
            return send_file(SCHEMA_FILE)
        else:
            return (
                jsonify({"message": f"Schema file not found: {SCHEMA_FILE}"}),
                404,
            )

    @app.route("/data/error.json")
    def error():
        if os.path.exists(f"{output_dir}/error.json"):
            with open(f"{output_dir}/error.json", "r") as error_file:
                return error_file.read()
        else:
            return json.dumps({})

    @app.route("/data/project.json")
    def projects():
        return {
            "id": "id",
            "project_json": json.loads(flask_app._project_json),
            "created_at": datetime.datetime.now().isoformat(),
        }

    @app.route("/data/project_history.json")
    def project_history():
        return [
            {
                "id": "id",
                "created_at": datetime.datetime.now().isoformat(),
            }
        ]

    @app.route("/", defaults={"path": "index.html"})
    @app.route("/<path:path>")
    def viewer_file(path):
        regex = r"\S*(\.png|\.ico|\.js|\.css|\.webmanifest|\.js\.map|\.css\.map)$"
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
        html = html.replace("</head>", f"{scripts}</head>")

        return html
