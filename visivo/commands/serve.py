import os
from pathlib import Path
from time import time

import click

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
    new,
)
from visivo.discovery.discover import Discover
from visivo.models.defaults import Defaults
from visivo.models.project import Project
from visivo.commands.serve_phase import serve_phase
from visivo.commands.parse_project_phase import parse_project_phase
from visivo.logger.logger import Logger


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
@new
@click.pass_context
def serve(
    ctx,
    output_dir,
    working_dir,
    source,
    port,
    dag_filter,
    threads,
    skip_compile,
    dbt_profile,
    dbt_target,
    new,
    project_dir,
    pd,
):
    start_time = time()
    logger = Logger.instance()
    server_url = f"http://localhost:{port}"
    is_default_working_dir = ctx.obj.get("is_default_working_dir")

    if is_default_working_dir and not new:
        discover = Discover(working_dir=working_dir, output_dir=output_dir)
        new = not discover.project_file_exists

    # Handle new project creation
    if new:
        skip_compile = True
        project = Project(
            name="Quickstart Visivo", sources=[], models=[], traces=[], charts=[], dashboards=[]
        )

        project.defaults = project.defaults or Defaults()
        if source:
            project.defaults.source_name = source

        final_project_dir = pd or project_dir or "."
        if os.path.exists(final_project_dir) and final_project_dir != ".":
            logger.error(f"Project already exists at '{final_project_dir}'")
            raise click.ClickException("Project directory already exists.")

        project.project_dir = final_project_dir
        working_dir = final_project_dir
        os.makedirs(output_dir, exist_ok=True)

    else:
        project = parse_project_phase(
            working_dir=working_dir,
            output_dir=output_dir,
            default_source=source,
            dbt_profile=dbt_profile,
            dbt_target=dbt_target,
        )

    # Start the development server
    server, on_change, on_ready = serve_phase(
        output_dir=output_dir,
        working_dir=working_dir,
        default_source=source,
        dag_filter=dag_filter,
        threads=threads,
        skip_compile=skip_compile,
        project=project,
        server_url=server_url,
        new=new,
    )

    logger.info(f"Initial build completed in {round(time() - start_time, 2)}s")
    logger.info(f"Server running at {server_url}")

    server.serve(
        host="0.0.0.0",
        port=port,
        on_change_callback=on_change,
        on_server_ready=on_ready,
    )
