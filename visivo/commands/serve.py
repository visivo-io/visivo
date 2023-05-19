import click
import os
import requests
import json
import socket
from flask import Flask, current_app
from livereload import Server
from .run import run_phase
from glob import glob
from .options import output_dir, working_dir, target, beta, port


def get_project_json(output_dir):
    project_json = ""
    with open(f"{output_dir}/project.json", "r") as f:
        project_json = json.load(f)
    return project_json


def app_phase(output_dir, working_dir, default_target, beta):
    app = Flask(
        __name__,
        static_folder=output_dir,
        static_url_path="/data",
    )
    app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0

    run_phase(
        output_dir=output_dir, working_dir=working_dir, default_target=default_target
    )

    origin = ""
    if beta:
        origin = "https://app.development.visivo.io"
    else:
        origin = "https://app.visivo.io"
    url = f"{origin}/static/apps/a/index.html"

    response = requests.get(url)
    with open(f"{output_dir}/index.html", "wb") as fp:
        fp.write(response.content)

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
            traces.append(
                {
                    "name": trace_name,
                    "id": trace_name,
                    "signed_data_file_url": f"/data/{trace_name}/data.json",
                }
            )
        return traces

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def index(path):
        return current_app.send_static_file("index.html")

    @app.after_request
    def add_cors_headers(response):
        response.headers.add("Access-Control-Allow-Origin", origin)
        return response

    return app


def serve_phase(output_dir, working_dir, default_target, beta):
    app = app_phase(
        output_dir=output_dir,
        working_dir=working_dir,
        default_target=default_target,
        beta=beta,
    )

    def cli_changed():
        run_phase(
            output_dir=output_dir,
            working_dir=working_dir,
            default_target=default_target,
            run_only_changed=True,
        )
        click.echo("Files changed. Reloading . . .")

    server = Server(app.wsgi_app)
    server.watch(f"**/*.yml", cli_changed)
    return server


@click.command()
@target
@working_dir
@output_dir
@beta
@port
def serve(output_dir, working_dir, target, beta, port):
    project_json = get_project_json(output_dir)
    server = serve_phase(
        output_dir=output_dir,
        working_dir=working_dir,
        default_target=target,
        beta=beta,
    )
    click.echo(
        f"Serving project at http://localhost:{port}/{socket.gethostname()}/projects/local/{project_json['name']}"
    )
    server.serve(host="0.0.0.0", port=port)
