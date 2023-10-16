import click

from .options import output_dir, working_dir, target, port


@click.command()
@target
@working_dir
@output_dir
@port
def serve(output_dir, working_dir, target, port):
    """
    Enables fast local development by spinning up a localhost server to run and view your project locally. Visivo will automatically refresh your project and re-run traces that have changed when you make updates to project files.
    """
    from visivo.commands.serve_phase import serve_phase
    from visivo.logging.logger import Logger

    server = serve_phase(
        output_dir=output_dir,
        working_dir=working_dir,
        default_target=target,
    )
    Logger.instance().debug(f"Serving project at http://localhost:{port}")
    server.serve(host="0.0.0.0", port=port)
