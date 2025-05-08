import click
from visivo.commands.options import (
    working_dir,
    output_dir,
    dag_filter,
    source,
    threads,
    dbt_profile,
    dbt_target,
    skip_compile,
    thumbnail_mode,
    port,
)


@click.command()
@working_dir
@output_dir
@dag_filter
@source
@threads
@dbt_profile
@dbt_target
@skip_compile
@thumbnail_mode
@port
def run(
    output_dir,
    working_dir,
    source,
    dag_filter,
    threads,
    dbt_profile,
    dbt_target,
    thumbnail_mode,
    skip_compile,
    port,
):
    """
    Compiles the project and then runs the trace queries to fetch data to populate in the traces. Writes all data to the source directory. Can skip the compile with the --skip-compile flag.
    """
    from visivo.logging.logger import Logger
    from visivo.commands.parse_project_phase import parse_project_phase
    from visivo.commands.serve_phase import serve_phase

    Logger.instance().debug("Running")

    # Parse project first
    project = parse_project_phase(
        working_dir=working_dir,
        output_dir=output_dir,
        default_source=source,
        dbt_profile=dbt_profile,
        dbt_target=dbt_target,
    )

    # Create temporary server for thumbnail generation if needed
    if thumbnail_mode != "none":
        server_url = f"http://localhost:{port}"

        # Create and configure server & callbacks
        server, on_project_change, on_server_ready = serve_phase(
            output_dir=output_dir,
            working_dir=working_dir,
            default_source=source,
            dag_filter=dag_filter,
            threads=threads,
            thumbnail_mode=thumbnail_mode,
            skip_compile=skip_compile,
            project=project,
            server_url=server_url,
        )

        # Start server in one-shot mode
        server.serve(
            host="0.0.0.0",
            port=port,
            on_server_ready=on_server_ready,
            one_shot=True,  # Server will shut down after initial run
        )
    else:
        # If no thumbnails needed, just run the phase directly
        from visivo.commands.run_phase import run_phase

        run_phase(
            default_source=source,
            output_dir=output_dir,
            working_dir=working_dir,
            dag_filter=dag_filter,
            threads=threads,
            dbt_profile=dbt_profile,
            dbt_target=dbt_target,
            thumbnail_mode=thumbnail_mode,
            skip_compile=skip_compile,
            project=project,
        )

    Logger.instance().success("Done")
