import click
import re
import os
from visivo.logging.logger import Logger
from visivo.utils import sanitize_filename
import json
from flask import Flask, send_from_directory, request, jsonify, Response
from livereload import Server
from .run_phase import run_phase
import datetime
from visivo.utils import VIEWER_PATH
import base64


def get_project_json(output_dir, dag_filter=None):
    project_json = ""
    with open(f"{output_dir}/project.json", "r") as f:
        project_json = json.load(f)

    if dag_filter:
        dashboards = [d for d in project_json["dashboards"] if d["name"] == dag_filter]
        if len(dashboards) == 1:
            project_json["dashboards"] = dashboards
        else:
            raise click.ClickException(
                f"Currently the serve command name filtering only supports filtering at the dashbaord level.  No dashboard with {dag_filter} found."
            )

    return project_json


def app_phase(output_dir, working_dir, default_source, dag_filter, threads, thumbnail_mode, skip_compile):
    app = Flask(
        __name__,
        static_folder=output_dir,
        static_url_path="/data",
    )
    app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
    thumbnail_dir = os.path.join(output_dir, "dashboard-thumbnails")

    runner = run_phase(
        output_dir=output_dir,
        working_dir=working_dir,
        default_source=default_source,
        dag_filter=dag_filter,
        threads=threads,
        thumbnail_mode=thumbnail_mode,
        skip_compile=skip_compile,
    )

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
                    (s for s in runner.project.sources if s.name == source_name),
                    None
                )
            
            if not source and runner.project.defaults and runner.project.defaults.source_name:
                # If no explicit source found, try the default
                source = next(
                    (s for s in runner.project.sources if s.name == runner.project.defaults.source_name),
                    None
                )
            
            if not source and runner.project.sources:
                # Fallback to first source if no default
                source = runner.project.sources[0]
                
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
            rows = result.to_dict('records')

            return jsonify({
                "columns": columns,
                "rows": rows
            }), 200

        except Exception as e:
            Logger.instance().error(f"Query execution error: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/trace/<trace_name>/query", methods=["GET"])
    def get_trace_query(trace_name):
        try:
            query_file_path = f"{output_dir}/{trace_name}/query.sql"
            if not os.path.exists(query_file_path):
                return jsonify({"message": f"Query file not found for trace: {trace_name}"}), 404
                
            with open(query_file_path, 'r') as f:
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
        return send_from_directory(VIEWER_PATH, "index.html")


    @app.route("/api/thumbnails/<dashboard_name>", methods=["GET"])
    def get_thumbnail(dashboard_name):
        try:
            safe_name = sanitize_filename(dashboard_name)
            thumbnail_path = os.path.join(thumbnail_dir, f"{safe_name}.png")
            
            if not os.path.exists(thumbnail_path):
                # Return a 404 response directly without logging
                return Response(status=404)

            with open(thumbnail_path, "rb") as f:
                thumbnail_data = f.read()
                thumbnail_b64 = base64.b64encode(thumbnail_data).decode('utf-8')
                return jsonify({
                    "thumbnail": f"data:image/png;base64,{thumbnail_b64}",
                    "updated_at": datetime.datetime.fromtimestamp(os.path.getmtime(thumbnail_path)).isoformat()
                })
        except Exception as e:
            Logger.instance().error(f"Error retrieving thumbnail: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/thumbnails/<dashboard_name>", methods=["POST"])
    def save_thumbnail(dashboard_name):
        try:
            safe_name = sanitize_filename(dashboard_name)
            data = request.get_json()
            if not data or "thumbnail" not in data:
                return jsonify({"message": "No thumbnail data provided"}), 400

            # Extract base64 data
            thumbnail_data = data["thumbnail"].split(",")[1]
            thumbnail_bytes = base64.b64decode(thumbnail_data)

            # Save thumbnail using safe name
            thumbnail_path = os.path.join(thumbnail_dir, f"{safe_name}.png")
            
            with open(thumbnail_path, "wb") as f:
                f.write(thumbnail_bytes)

            return jsonify({
                "message": "Thumbnail saved successfully",
                "updated_at": datetime.datetime.now().isoformat()
            })
        except Exception as e:
            Logger.instance().error(f"Error saving thumbnail: {str(e)}")
            return jsonify({"message": str(e)}), 500

    return app, runner.project


def serve_phase(output_dir, working_dir, default_source, dag_filter, threads, thumbnail_mode, skip_compile):
    app, project = app_phase(
        output_dir=output_dir,
        working_dir=working_dir,
        default_source=default_source,
        dag_filter=dag_filter,
        threads=threads,
        thumbnail_mode=thumbnail_mode,
        skip_compile=skip_compile,
    )

    def cli_changed():  # TODO: Include changes to cmd models
        try:
            runner = run_phase(
                output_dir=output_dir,
                working_dir=working_dir,
                default_source=default_source,
                dag_filter=dag_filter,
                run_only_changed=True,
                threads=threads,
                soft_failure=True,
                thumbnail_mode=thumbnail_mode,
                skip_compile=False,
            )
            Logger.instance().info("Files changed. Reloading . . .")
            with open(f"{output_dir}/error.json", "w") as error_file:
                error_file.write(json.dumps({}))
        except Exception as e:
            error_message = str(e)
            Logger.instance().error(error_message)
            with open(f"{output_dir}/error.json", "w") as error_file:
                error_file.write(json.dumps({"message": error_message}))

    dbt_file = None
    if project.dbt and project.dbt.enabled:
        dbt_file = project.dbt.get_output_file(output_dir, working_dir)

    def ignore(filename):
        if not dbt_file:
            return False
        return filename in dbt_file

    server = Server(app.wsgi_app)
    server.watch(filepath="**/*.yml", func=cli_changed, ignore=ignore)
    return server
