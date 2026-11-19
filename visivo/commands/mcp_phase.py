import socket
from threading import Thread

import click

from visivo.agent.mcp_stdio import serve_stdio
from visivo.commands.parse_project_phase import parse_project_phase
from visivo.commands.serve_phase import serve_phase
from visivo.discovery.discover import Discover
from visivo.logger.logger import Logger

LOCAL_HOST = "127.0.0.1"


def port_is_free(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            probe.bind((LOCAL_HOST, port))
        except OSError:
            return False
    return True


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

    project_file_exists = Discover(
        working_dir=working_dir, output_dir=output_dir
    ).project_file_exists
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
    Logger.instance().info(f"Serving MCP over stdio. Review drafts at {server_url}")

    try:
        serve_stdio(server.project_app, reader, writer)
    finally:
        server.stop()
