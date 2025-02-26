import click
import re
import os
from visivo.utils import get_dashboards_dir
import json
from flask import Flask, send_from_directory, request, jsonify, Response
import datetime
from visivo.utils import VIEWER_PATH
from visivo.logging.logger import Logger

from visivo.server.repositories.worksheet_repository import WorksheetRepository

def flask_app(output_dir, dag_filter, project):
    app = Flask(
        __name__,
        static_folder=output_dir,
        static_url_path="/data",
    )
    
    app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
    
    thumbnail_dir = get_dashboards_dir(output_dir)

    worksheet_repo = WorksheetRepository(os.path.join(output_dir, "worksheets.db"))

    def get_project_json(output_dir, dag_filter=None):
        project_json = ""
        with open(f"{output_dir}/project.json", "r") as f:
            project_json = json.load(f)
        # if dag_filter:
        # TODO: We could implement something that filters the dashboard here, but maybe we should be filterting in compile? 
        #     project_json = filter_dag(project, dag_filter)

        return project_json

    @app.route("/data/<trace_name>/data.json")
    def serve_trace_data(trace_name):
        try:
            trace_dir = os.path.join(output_dir, trace_name)
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

    @app.route("/api/query/<project_id>", methods=["POST"])
    def execute_query(project_id):
        try:
            data = request.get_json()
            if not data or "query" not in data:
                return jsonify({"message": "No query provided"}), 400

            query = data["query"]
            source_name = data.get("source")
            worksheet_id = data.get("worksheet_id")  # New: Get worksheet_id if provided

            # Get the appropriate source based on the request
            source = None
            if source_name:
                source = next(
                    (s for s in project.sources if s.name == source_name), None
                )

            if not source and project.defaults and project.defaults.source_name:
                source = next(
                    (
                        s
                        for s in project.sources
                        if s.name == project.defaults.source_name
                    ),
                    None,
                )

            if not source and project.sources:
                source = project.sources[0]

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
                    "rows": result.to_dict("records")
                }

            # If worksheet_id is provided, save the results
            if worksheet_id:
                query_stats = {
                    "timestamp": datetime.datetime.utcnow().isoformat(),
                    "source": source.name
                }
                worksheet_repo.save_results(
                    worksheet_id,
                    json.dumps(response_data),
                    json.dumps(query_stats)
                )

            return jsonify(response_data), 200

        except Exception as e:
            Logger.instance().error(f"Query execution error: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/trace/<trace_name>/query", methods=["GET"])
    def get_trace_query(trace_name):
        try:
            query_file_path = f"{output_dir}/{trace_name}/query.sql"
            if not os.path.exists(query_file_path):
                return (
                    jsonify(
                        {"message": f"Query file not found for trace: {trace_name}"}
                    ),
                    404,
                )

            with open(query_file_path, "r") as f:
                query_contents = f.read()

            return jsonify({"query": query_contents}), 200
        except Exception as e:
            Logger.instance().error(f"Error reading trace query: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/data/error.json")
    def error():
        if os.path.exists(f"{output_dir}/error.json"):
            with open(f"{output_dir}/error.json", "r") as error_file:
                return error_file.read()
        else:
            return json.dumps({})

    @app.route("/data/project.json")
    def projects():
        project_json = get_project_json(output_dir, dag_filter)
        return {
            "id": "id",
            "project_json": project_json,
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

    @app.route("/data/dag.json")
    def dag():
        with open(f"{output_dir}/dag.json", "r") as f:
            dag_json = json.load(f)
            return dag_json

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

    @app.route("/data/dashboards/<dashboard_name_hash>.png")
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

    @app.route("/api/worksheet", methods=["GET"])
    def list_worksheets():
        """List all worksheets."""
        try:
            worksheets = worksheet_repo.list_worksheets()
            return jsonify(worksheets)
        except Exception as e:
            Logger.instance().error(f"Error listing worksheets: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/worksheet/<worksheet_id>", methods=["GET"])
    def get_worksheet(worksheet_id):
        """Get a specific worksheet."""
        try:
            worksheet = worksheet_repo.get_worksheet(worksheet_id)
            if worksheet is None:
                return jsonify({"message": "Worksheet not found"}), 404
            return jsonify(worksheet)
        except Exception as e:
            Logger.instance().error(f"Error getting worksheet: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/worksheet", methods=["POST"])
    def create_worksheet():
        """Create a new worksheet."""
        try:
            data = request.get_json()
            if not data or "name" not in data:
                return jsonify({"message": "Name is required"}), 400

            result = worksheet_repo.create_worksheet(
                name=data["name"],
                query=data.get("query", ""),
                selected_source=data.get("selected_source")
            )
            return jsonify(result), 201
        except Exception as e:
            Logger.instance().error(f"Error creating worksheet: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/worksheet/<worksheet_id>", methods=["PUT"])
    def update_worksheet(worksheet_id):
        """Update a worksheet."""
        try:
            data = request.get_json()
            if not data:
                return jsonify({"message": "No update data provided"}), 400

            success = worksheet_repo.update_worksheet(worksheet_id, data)
            if not success:
                return jsonify({"message": "Worksheet not found"}), 404
            
            return jsonify({"message": "Worksheet updated successfully"})
        except Exception as e:
            Logger.instance().error(f"Error updating worksheet: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/worksheet/<worksheet_id>", methods=["DELETE"])
    def delete_worksheet(worksheet_id):
        """Delete a worksheet."""
        try:
            success = worksheet_repo.delete_worksheet(worksheet_id)
            if not success:
                return jsonify({"message": "Worksheet not found"}), 404
            return jsonify({"message": "Worksheet deleted successfully"})
        except Exception as e:
            Logger.instance().error(f"Error deleting worksheet: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/worksheet/session", methods=["GET"])
    def get_session_state():
        """Get the current session state."""
        try:
            worksheets = worksheet_repo.list_worksheets()
            return jsonify([w["session_state"] for w in worksheets])
        except Exception as e:
            Logger.instance().error(f"Error getting session state: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/worksheet/session", methods=["PUT"])
    def update_session_state():
        """Update the session state."""
        try:
            data = request.get_json()
            if not isinstance(data, list):
                return jsonify({"message": "Expected array of session states"}), 400

            success = worksheet_repo.update_session_states(data)
            if not success:
                return jsonify({"message": "Failed to update session state"}), 500
            
            return jsonify({"message": "Session state updated successfully"})
        except Exception as e:
            Logger.instance().error(f"Error updating session state: {str(e)}")
            return jsonify({"message": str(e)}), 500

    return app
