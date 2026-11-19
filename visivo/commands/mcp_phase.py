import os
import socket
import time
from threading import Thread

import click

from visivo.agent.mcp_stdio import serve_stdio
from visivo.commands.parse_project_phase import parse_project_phase
from visivo.commands.serve_phase import serve_phase
from visivo.discovery.discover import Discover
from visivo.logger.logger import Logger

LOCAL_HOST = "127.0.0.1"
LOCAL_ADDRESSES = (LOCAL_HOST, "::1")
WEB_APP_START_TIMEOUT_S = 15


def port_is_free(port):
    """False when something answers on the port, whatever address it bound."""
    for address in LOCAL_ADDRESSES:
        try:
            socket.create_connection((address, port), timeout=0.5).close()
        except OSError:
            continue
        return False
    return True


def web_app_started(server, port, timeout=None):
    deadline = time.monotonic() + (timeout or WEB_APP_START_TIMEOUT_S)
    while time.monotonic() < deadline:
        if server.start_error is not None:
            return False
        if not port_is_free(port):
            return True
        time.sleep(0.05)
    return False


def mcp_phase(
    output_dir,
    working_dir,
    default_source,
    threads,
    dbt_profile,
    dbt_target,
    no_deprecation_warnings,
    host,
    port,
    reader,
    writer,
):
    server_url = f"http://localhost:{port}"
    if not port_is_free(port):
        raise click.ClickException(
            f"Port {port} is in use. If `visivo serve` runs there for this project, "
            f"connect your client to {server_url}/api/mcp/ over HTTP. "
            "Otherwise pass --port."
        )

    try:
        os.makedirs(output_dir, exist_ok=True)
    except OSError as refused:
        raise click.ClickException(
            f"Cannot create the output directory {output_dir}: {refused.strerror}. "
            "Pass --working-dir with the path of your Visivo project, or --output-dir."
        )

    project_file_exists = Discover(
        working_dir=working_dir, output_dir=output_dir
    ).project_file_exists
    if not project_file_exists:
        Logger.instance().info(
            f"No Visivo project file in {working_dir}. Serving an empty project. "
            "Pass --working-dir with the path of your project."
        )
    project = parse_project_phase(
        working_dir=working_dir,
        output_dir=output_dir,
        default_source=default_source,
        dbt_profile=dbt_profile,
        dbt_target=dbt_target,
    )
    if not project_file_exists:
        project.project_dir = working_dir

    server, on_change, on_ready = serve_phase(
        output_dir=output_dir,
        working_dir=working_dir,
        default_source=default_source,
        dag_filter=None,
        threads=threads,
        skip_compile=not project_file_exists,
        project=project,
        server_url=server_url,
        no_deprecation_warnings=no_deprecation_warnings,
        host=host,
        port=port,
    )
    # The build runs beside the protocol loop, so a client's handshake does
    # not wait for the project's queries.
    Thread(
        target=server.serve,
        kwargs={
            "host": LOCAL_HOST,
            "port": port,
            "on_change_callback": on_change,
            "on_server_ready": on_ready,
        },
        daemon=True,
    ).start()
    if not web_app_started(server, port):
        server.stop()
        raise click.ClickException(
            f"The web app did not start on port {port}. Pass --port to use another port."
        )
    Logger.instance().info(f"Serving MCP over stdio. Review drafts at {server_url}")

    try:
        serve_stdio(server.project_app, reader, writer)
    finally:
        server.stop()
