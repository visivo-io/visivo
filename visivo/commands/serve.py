import click
import os
import re
import json
import pkg_resources
from flask import Flask, current_app, send_from_directory
from livereload import Server
from .run import run_phase
from glob import glob
from .options import output_dir, working_dir, target, port

VIEWER_PATH = pkg_resources.resource_filename("visivo", "viewer/")


def get_project_json(output_dir):
    project_json = ""
    with open(f"{output_dir}/project.json", "r") as f:
        project_json = json.load(f)
    return project_json


def app_phase(output_dir, working_dir, default_target):
    app = Flask(
        __name__,
        static_folder=output_dir,
        static_url_path="/data",
    )
    app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0

    run_phase(
        output_dir=output_dir, working_dir=working_dir, default_target=default_target
    )

    @app.route("/api/projects/")
    def projects():
        project_json = get_project_json(output_dir)
        return {"project_json": project_json}

    @app.route("/api/traces/")
    def traces():
        trace_dirs = glob(f"{output_dir}/*/", recursive=True)
        traces = []
        for trace_dir in trace_dirs:
            trace_name = os.path.basename(os.path.normpath(trace_dir))
            if os.path.exists(f"{output_dir}/{trace_name}/data.json"):
                traces.append(
                    {
                        "name": trace_name,
                        "id": trace_name,
                        "signed_data_file_url": f"/data/{trace_name}/data.json",
                    }
                )
        return traces

    @app.route("/", defaults={"path": "index.html"})
    @app.route("/<path:path>")
    def viewer_file(path):
        regex = r"\S*(\.png|\.ico|\.js|\.css|\.webmanifest|\.js\.map|\.css\.map)$"
        if re.match(regex, path):
            return send_from_directory(VIEWER_PATH, path)
        return send_from_directory(VIEWER_PATH, "index.html")

    return app


def serve_phase(output_dir, working_dir, default_target):
    app = app_phase(
        output_dir=output_dir,
        working_dir=working_dir,
        default_target=default_target,
    )

    def cli_changed():
        try:
            run_phase(
                output_dir=output_dir,
                working_dir=working_dir,
                default_target=default_target,
                run_only_changed=True,
            )
            click.echo("Files changed. Reloading . . .")
        except Exception as e:
            click.echo(e)

    server = Server(app.wsgi_app)
    server.watch(f"**/*.yml", cli_changed)
    return server


@click.command()
@target
@working_dir
@output_dir
@port
def serve(output_dir, working_dir, target, port):
    """
    Enables fast local development by spinning up a localhost server to run and view your project locally. Visivo will automatically refresh your project and re-run traces that have changed when you make updates to project files.
    """
    project_json = get_project_json(output_dir)
    server = serve_phase(
        output_dir=output_dir,
        working_dir=working_dir,
        default_target=target,
    )
    click.echo(f"Serving project at http://localhost:{port}")
    server.serve(host="0.0.0.0", port=port)
