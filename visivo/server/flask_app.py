import click
import re
import os
from visivo.utils import get_dashboards_dir
import json
from flask import Flask, send_from_directory, request, jsonify, Response
import datetime
from visivo.utils import VIEWER_PATH
from visivo.logging.logger import Logger


def flask_app(output_dir, dag_filter, project):
    app = Flask(
        __name__,
        static_folder=output_dir,
        static_url_path="/data",
    )
    
    app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
    thumbnail_dir = get_dashboards_dir(output_dir)

    def get_project_json(output_dir, dag_filter=None):
        project_json = ""
        with open(f"{output_dir}/project.json", "r") as f:
            project_json = json.load(f)

        if (
            dag_filter
        ):  # TODO: I'm actually not sure why this works. It seems to be combination of our old name filter and the new dag filter.
            dashboards = [
                d for d in project_json["dashboards"] if d["name"] == dag_filter
            ]
            if len(dashboards) == 1:
                project_json["dashboards"] = dashboards
            else:
                raise click.ClickException(
                    f"Currently the serve command name filtering only supports filtering at the dashbaord level.  No dashboard with {dag_filter} found."
                )

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
            source_name = data.get("source")  # Get source name from request

            # Get the appropriate source based on the request
            source = None
            if source_name:
                # First try to find the explicitly requested source
                source = next(
                    (s for s in project.sources if s.name == source_name), None
                )

            if not source and project.defaults and project.defaults.source_name:
                # If no explicit source found, try the default
                source = next(
                    (
                        s
                        for s in project.sources
                        if s.name == project.defaults.source_name
                    ),
                    None,
                )

            if not source and project.sources:
                # Fallback to first source if no default
                source = project.sources[0]

            if not source:
                return jsonify({"message": "No source configured"}), 400

            Logger.instance().info(f"Executing query with source: {source.name}")

            # Execute the query using read_sql
            result = source.read_sql(query)

            # Transform the result into the expected format
            if result is None or result.empty:
                return jsonify({"columns": [], "rows": []}), 200

            # Result is a pandas DataFrame
            columns = list(result.columns)
            rows = result.to_dict("records")

            return jsonify({"columns": columns, "rows": rows}), 200

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

    return app
