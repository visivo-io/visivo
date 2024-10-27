import click
import re
import os
from visivo.logging.logger import Logger
import json
from flask import Flask, current_app, send_from_directory
from livereload import Server
from .run_phase import run_phase
import datetime
import importlib.resources as resources

VIEWER_PATH = resources.files("visivo") / "viewer"


def write_dag(project, output_dir):
    with open(f"{output_dir}/dag.json", "w") as fp:
        fp.write(json.dumps(project.dag_dict()))


def get_project_json(output_dir, name_filter=None):
    project_json = ""
    with open(f"{output_dir}/project.json", "r") as f:
        project_json = json.load(f)

    if name_filter:
        dashboards = [d for d in project_json["dashboards"] if d["name"] == name_filter]
        if len(dashboards) == 1:
            project_json["dashboards"] = dashboards
        else:
            raise click.ClickException(
                f"Currently the serve command name filtering only supports filtering at the dashbaord level.  No dashboard with {name_filter} found."
            )

    return project_json


def app_phase(output_dir, working_dir, default_source, name_filter, threads):
    app = Flask(
        __name__,
        static_folder=output_dir,
        static_url_path="/data",
    )
    app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0

    runner = run_phase(
        output_dir=output_dir,
        working_dir=working_dir,
        default_source=default_source,
        name_filter=name_filter,
        threads=threads,
    )
    write_dag(project=runner.project, output_dir=output_dir)

    @app.route("/data/error.json")
    def error():
        if os.path.exists(f"{output_dir}/error.json"):
            with open(f"{output_dir}/error.json", "r") as error_file:
                return error_file.read()
        else:
            return json.dumps({})

    @app.route("/data/project.json")
    def projects():
        project_json = get_project_json(output_dir, name_filter)
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

    return app, runner.project


def serve_phase(output_dir, working_dir, default_source, name_filter, threads):
    app, project = app_phase(
        output_dir=output_dir,
        working_dir=working_dir,
        default_source=default_source,
        name_filter=name_filter,
        threads=threads,
    )

    def cli_changed():  # TODO: Include changes to cmd models
        try:
            runner = run_phase(
                output_dir=output_dir,
                working_dir=working_dir,
                default_source=default_source,
                name_filter=name_filter,
                run_only_changed=True,
                threads=threads,
                soft_failure=True,
            )
            write_dag(project=runner.project, output_dir=output_dir)
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
