import click

from .options import name_filter, output_dir, working_dir, source, port, threads


@click.command()
@source
@working_dir
@output_dir
@name_filter
@port
@threads
def serve(output_dir, working_dir, source, port, name_filter, threads):
    """
    Enables fast local development by spinning up a localhost server to run and view your project locally. Visivo will automatically refresh your project and re-run traces that have changed when you make updates to project files.
    """
    from visivo.commands.serve_phase import serve_phase
    from visivo.logging.logger import Logger

    server = serve_phase(
        output_dir=output_dir,
        working_dir=working_dir,
        default_source=source,
        name_filter=name_filter,
        threads=threads,
    )
    Logger.instance().debug(f"Serving project at http://localhost:{port}")
    server.serve(host="0.0.0.0", port=port)
