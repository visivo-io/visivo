import re
import os
import json
from flask import Flask, send_from_directory, request, jsonify, Response, send_file
import datetime
from visivo.models.project import Project
from visivo.parsers.serializer import Serializer
from visivo.utils import VIEWER_PATH, SCHEMA_FILE
from visivo.logging.logger import Logger
from visivo.server.project_writer import ProjectWriter
from visivo.server.repositories.worksheet_repository import WorksheetRepository
from visivo.server.text_editors import get_editor_configs
import subprocess


class FlaskApp:
    def __init__(self, output_dir, project: Project):
        self.app = Flask(__name__, static_folder=output_dir, static_url_path="/data")

        self._project_json = (
            Serializer(project=project).dereference().model_dump_json(exclude_none=True)
        )
        self._project = project

        self.app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
        self.worksheet_repo = WorksheetRepository(os.path.join(output_dir, "worksheets.db"))

        @self.app.route("/data/<trace_name>/data.json")
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

        @self.app.route("/data/explorer.json")
        def explorer():
            if os.path.exists(f"{output_dir}/explorer.json"):
                with open(f"{output_dir}/explorer.json", "r") as f:
                    return json.load(f)
            else:
                return json.dumps({})

        @self.app.route("/data/schema.json")
        def schema():
            if os.path.exists(SCHEMA_FILE):
                return send_file(SCHEMA_FILE)
            else:
                return (
                    jsonify({"message": f"Schema file not found: {SCHEMA_FILE}"}),
                    404,
                )

        @self.app.route("/api/project/named_children", methods=["GET"])
        def named_children():
            named_children = self._project.named_child_nodes()
            if named_children:
                return jsonify(named_children)
            else:
                return jsonify({})

        @self.app.route("/api/project/project_file_path", methods=["GET"])
        def project_file_path():
            project_file_path = self._project.project_file_path
            if project_file_path:
                return jsonify(project_file_path)
            else:
                return jsonify({})

        @self.app.route("/api/project/write_changes", methods=["POST"])
        def write_changes():

            data = request.get_json()
            if not data:
                return jsonify({"message": "No data provided"}), 400

            try:
                project_writer = ProjectWriter(data)
                project_writer.update_file_contents()
                project_writer.write()
                return jsonify({"message": "Changes written successfully"}), 200
            except Exception as e:
                Logger.instance().error(f"Error writing changes: {str(e)}")
                return jsonify({"message": str(e)}), 500

        @self.app.route("/api/query/<project_id>", methods=["POST"])
        def execute_query(project_id):
            try:
                data = request.get_json()
                if not data or "query" not in data:
                    return jsonify({"message": "No query provided"}), 400

                query = data["query"]
                source_name = data.get("source")
                Logger.instance().info(f"Executing query with source: {source_name}")
                worksheet_id = data.get("worksheet_id")  # New: Get worksheet_id if provided

                # Get the appropriate source based on the request
                source = None
                if source_name:
                    source = next(
                        (s for s in self._project.sources if s.name == source_name),
                        None,
                    )

                if not source and self._project.defaults and self._project.defaults.source_name:
                    source = next(
                        (
                            s
                            for s in self._project.sources
                            if s.name == self._project.defaults.source_name
                        ),
                        None,
                    )

                if not source and self._project.sources:
                    source = self._project.sources[0]

                if not source:
                    return jsonify({"message": "No source configured"}), 400

                Logger.instance().info(f"Executing query with source: {source.name}")

                # Execute the query using read_sql
                result = source.read_sql(query)

                # Transform the result into the expected format
                if result is None or result.empty:
                    response_data = {"columns": [], "rows": []}
                else:
                    response_data = {
                        "columns": list(result.columns),
                        "rows": result.to_dict("records"),
                    }

                # If worksheet_id is provided, save the results
                if worksheet_id:
                    query_stats = {
                        "timestamp": datetime.datetime.utcnow().isoformat(),
                        "source": source.name,
                    }
                    self.worksheet_repo.save_results(
                        worksheet_id, json.dumps(response_data), json.dumps(query_stats)
                    )

                return jsonify(response_data), 200

            except Exception as e:
                Logger.instance().error(f"Query execution error: {str(e)}")
                return jsonify({"message": str(e)}), 500

        @self.app.route("/api/trace/<trace_name>/query", methods=["GET"])
        def get_trace_query(trace_name):
            try:
                query_file_path = f"{output_dir}/traces/{trace_name}/query.sql"
                if not os.path.exists(query_file_path):
                    return (
                        jsonify({"message": f"Query file not found for trace: {trace_name}"}),
                        404,
                    )

                with open(query_file_path, "r") as f:
                    query_contents = f.read()

                return jsonify({"query": query_contents}), 200
            except Exception as e:
                Logger.instance().error(f"Error reading trace query: {str(e)}")
                return jsonify({"message": str(e)}), 500

        @self.app.route("/data/error.json")
        def error():
            if os.path.exists(f"{output_dir}/error.json"):
                with open(f"{output_dir}/error.json", "r") as error_file:
                    return error_file.read()
            else:
                return json.dumps({})

        @self.app.route("/data/project.json")
        def projects():
            return {
                "id": "id",
                "project_json": json.loads(self._project_json),
                "created_at": datetime.datetime.now().isoformat(),
            }

        @self.app.route("/data/project_history.json")
        def project_history():
            return [
                {
                    "id": "id",
                    "created_at": datetime.datetime.now().isoformat(),
                }
            ]

        @self.app.route("/", defaults={"path": "index.html"})
        @self.app.route("/<path:path>")
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

        @self.app.route("/data/dashboards/<dashboard_name_hash>.png")
        def get_thumbnail(dashboard_name_hash):
            try:
                # Since static_url_path="/data" maps to output_dir, we can use send_from_directory with output_dir
                thumbnail_path = os.path.join("dashboards", f"{dashboard_name_hash}.png")
                if not os.path.exists(os.path.join(output_dir, thumbnail_path)):
                    Logger.instance().debug(f"Thumbnail not found at path: {thumbnail_path}")
                    return Response(status=404)

                return send_from_directory(output_dir, thumbnail_path)
            except Exception as e:
                Logger.instance().error(f"Error retrieving thumbnail: {str(e)}")
                return jsonify({"message": str(e)}), 500

        @self.app.route("/api/worksheet", methods=["GET"])
        def list_worksheets():
            """List all worksheets."""
            try:
                worksheets = self.worksheet_repo.list_worksheets()
                return jsonify(worksheets)
            except Exception as e:
                Logger.instance().error(f"Error listing worksheets: {str(e)}")
                return jsonify({"message": str(e)}), 500

        @self.app.route("/api/worksheet/<worksheet_id>", methods=["GET"])
        def get_worksheet(worksheet_id):
            """Get a specific worksheet."""
            try:
                worksheet = self.worksheet_repo.get_worksheet(worksheet_id)
                if worksheet is None:
                    return jsonify({"message": "Worksheet not found"}), 404
                return jsonify(worksheet)
            except Exception as e:
                Logger.instance().error(f"Error getting worksheet: {str(e)}")
                return jsonify({"message": str(e)}), 500

        @self.app.route("/api/worksheet", methods=["POST"])
        def create_worksheet():
            """Create a new worksheet."""
            try:
                data = request.get_json()
                if not data or "name" not in data:
                    return jsonify({"message": "Name is required"}), 400

                result = self.worksheet_repo.create_worksheet(
                    name=data["name"],
                    query=data.get("query", ""),
                    selected_source=data.get("selected_source"),
                )
                return jsonify(result), 201
            except Exception as e:
                Logger.instance().error(f"Error creating worksheet: {str(e)}")
                return jsonify({"message": str(e)}), 500

        @self.app.route("/api/worksheet/<worksheet_id>", methods=["PUT"])
        def update_worksheet(worksheet_id):
            """Update a worksheet."""
            try:
                data = request.get_json()
                if not data:
                    return jsonify({"message": "No update data provided"}), 400

                success = self.worksheet_repo.update_worksheet(worksheet_id, data)
                if not success:
                    return jsonify({"message": "Worksheet not found"}), 404

                return jsonify({"message": "Worksheet updated successfully"})
            except Exception as e:
                Logger.instance().error(f"Error updating worksheet: {str(e)}")
                return jsonify({"message": str(e)}), 500

        @self.app.route("/api/worksheet/<worksheet_id>", methods=["DELETE"])
        def delete_worksheet(worksheet_id):
            """Delete a worksheet."""
            try:
                success = self.worksheet_repo.delete_worksheet(worksheet_id)
                if not success:
                    return jsonify({"message": "Worksheet not found"}), 404
                return jsonify({"message": "Worksheet deleted successfully"})
            except Exception as e:
                Logger.instance().error(f"Error deleting worksheet: {str(e)}")
                return jsonify({"message": str(e)}), 500

        @self.app.route("/api/worksheet/session", methods=["GET"])
        def get_session_state():
            """Get the current session state."""
            try:
                worksheets = self.worksheet_repo.list_worksheets()
                return jsonify([w["session_state"] for w in worksheets])
            except Exception as e:
                Logger.instance().error(f"Error getting session state: {str(e)}")
                return jsonify({"message": str(e)}), 500

        @self.app.route("/api/worksheet/session", methods=["PUT"])
        def update_session_state():
            """Update the session state."""
            try:
                data = request.get_json()
                if not isinstance(data, list):
                    return jsonify({"message": "Expected array of session states"}), 400

                success = self.worksheet_repo.update_session_states(data)
                if not success:
                    return jsonify({"message": "Failed to update session state"}), 500

                return jsonify({"message": "Session state updated successfully"})
            except Exception as e:
                Logger.instance().error(f"Error updating session state: {str(e)}")
                return jsonify({"message": str(e)}), 500

        @self.app.route("/api/editors/installed", methods=["GET"])
        def get_installed_editors():
            editors, platform = get_editor_configs()

            # Check which editors are installed
            installed_editors = []
            for editor in editors:
                # Skip editors that don't support this platform
                if not editor["paths"][platform]:
                    continue

                for path in editor["paths"][platform]:
                    if os.path.exists(path):
                        # Only send back safe information to the client
                        installed_editors.append({"name": editor["name"], "id": editor["id"]})
                        break

            return jsonify(installed_editors)

        @self.app.route("/api/editors/open", methods=["POST"])
        def open_in_editor():
            data = request.get_json()
            if not data or "editorId" not in data or "filePath" not in data:
                return jsonify({"error": "Missing required parameters"}), 400

            editor_id = data["editorId"]
            file_path = data["filePath"]

            # Validate file path exists
            if not os.path.exists(file_path):
                return jsonify({"error": "File not found"}), 404

            # Get editor configurations
            editors, platform = get_editor_configs()

            # Find the selected editor
            editor_config = next((e for e in editors if e["id"] == editor_id), None)
            if not editor_config or not editor_config["commands"][platform]:
                return jsonify({"error": "Invalid editor for this platform"}), 400

            try:
                # Get the command for the selected editor
                command = editor_config["commands"][platform]

                # Special handling for VS Code on macOS
                if platform == "mac" and editor_id == "vscode":
                    if command[0] == "open":
                        # When using 'open' command, file path goes at the end
                        subprocess.Popen(command + ["--", file_path])
                    else:
                        # When using 'code' command directly
                        subprocess.Popen(command + [file_path])
                else:
                    # Normal handling for other editors
                    subprocess.Popen(command + [file_path])

                return jsonify({"message": "File opened successfully"}), 200
            except Exception as e:
                return jsonify({"error": str(e)}), 500

    @property
    def project(self):
        return self._project

    @project.setter
    def project(self, value):
        self._project_json = (
            Serializer(project=value).dereference().model_dump_json(exclude_none=True)
        )
        self._project = value
