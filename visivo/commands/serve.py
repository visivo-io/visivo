import click
from time import time

from .options import dag_filter, output_dir, working_dir, source, port, threads, thumbnail_mode, skip_compile


@click.command()
@source
@working_dir
@output_dir
@dag_filter
@port
@thumbnail_mode
@threads
@skip_compile
def serve(output_dir, working_dir, source, port, dag_filter, threads, thumbnail_mode, skip_compile):
    """
    Enables fast local development by spinning up a localhost server to run and view your project locally. Visivo will automatically refresh your project and re-run traces that have changed when you make updates to project files.
    """
    start_time = time()
    from visivo.commands.serve_phase import serve_phase
    from visivo.logging.logger import Logger
    server_url = f"http://localhost:{port}"

    server = serve_phase(
        output_dir=output_dir,
        working_dir=working_dir,
        default_source=source,
        dag_filter=dag_filter,
        threads=threads,
        thumbnail_mode=thumbnail_mode,
        skip_compile=skip_compile,
    )
    serve_duration = time() - start_time    
    Logger.instance().info(f"Serving project took {round(serve_duration, 2)}s")
    Logger.instance().info(f"Serving project at {server_url}")
    server.serve(host="0.0.0.0", port=port)
