import click
import os
import re
from visivo.logging.logger import Logger
import json
import pkg_resources
from flask import Flask, current_app, send_from_directory
from livereload import Server
from .run_phase import run_phase
from glob import glob

VIEWER_PATH = pkg_resources.resource_filename("visivo", "viewer/")


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


def app_phase(output_dir, working_dir, default_target, name_filter, threads):
    app = Flask(
        __name__,
        static_folder=output_dir,
        static_url_path="/data",
    )
    app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0

    run_phase(
        output_dir=output_dir,
        working_dir=working_dir,
        default_target=default_target,
        name_filter=name_filter,
        threads=threads,
    )

    @app.route("/data/project.json")
    def projects():
        project_json = get_project_json(output_dir, name_filter)
        return {"project_json": project_json}

    @app.route("/", defaults={"path": "index.html"})
    @app.route("/<path:path>")
    def viewer_file(path):
        regex = r"\S*(\.png|\.ico|\.js|\.css|\.webmanifest|\.js\.map|\.css\.map)$"
        if re.match(regex, path):
            return send_from_directory(VIEWER_PATH, path)
        return send_from_directory(VIEWER_PATH, "index.html")

    return app


def serve_phase(output_dir, working_dir, default_target, name_filter, threads):
    app = app_phase(
        output_dir=output_dir,
        working_dir=working_dir,
        default_target=default_target,
        name_filter=name_filter,
        threads=threads,
    )

    def cli_changed():  # TODO: Include changes to cmd models
        try:
            run_phase(
                output_dir=output_dir,
                working_dir=working_dir,
                default_target=default_target,
                name_filter=name_filter,
                run_only_changed=True,
                threads=threads,
                soft_failure=True,
            )
            Logger.instance().info("Files changed. Reloading . . .")
        except Exception as e:
            Logger.instance().error(e)

    server = Server(app.wsgi_app)
    server.watch(f"**/*.yml", cli_changed)
    return server
