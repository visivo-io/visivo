import click
from time import time
import json

from visivo.commands.options import (
    dag_filter,
    output_dir,
    working_dir,
    source,
    port,
    threads,
    dbt_profile,
    dbt_target,
    skip_compile,
)


@click.command()
@source
@working_dir
@output_dir
@dag_filter
@port
@threads
@skip_compile
@dbt_profile
@dbt_target
def serve(
    output_dir,
    working_dir,
    source,
    port,
    dag_filter,
    threads,
    skip_compile,
    dbt_profile,
    dbt_target,
):
    """
    Enables fast local development by spinning up a localhost server to run and view your project locally. Visivo will automatically refresh your project and re-run traces that have changed when you make updates to project files.
    """
    start_time = time()
    from visivo.commands.serve_phase import serve_phase
    from visivo.commands.parse_project_phase import parse_project_phase
    from visivo.logger.logger import Logger

    server_url = f"http://localhost:{port}"

    # Parse project first
    project = parse_project_phase(
        working_dir=working_dir,
        output_dir=output_dir,
        default_source=source,
        dbt_profile=dbt_profile,
        dbt_target=dbt_target,
    )

    # Create and configure server & callbacks
    server, on_project_change, on_server_ready = serve_phase(
        output_dir=output_dir,
        working_dir=working_dir,
        default_source=source,
        dag_filter=dag_filter,
        threads=threads,
        skip_compile=skip_compile,
        project=project,
        server_url=server_url,
    )

    # Start serving with hot reload
    serve_duration = time() - start_time
    Logger.instance().info(f"Initial build completed in {round(serve_duration, 2)}s")
    Logger.instance().info(f"Server running at {server_url}")

    # Start the server with file watching
    server.serve(
        host="0.0.0.0",
        port=port,
        on_change_callback=on_project_change,
        on_server_ready=on_server_ready,
    )
