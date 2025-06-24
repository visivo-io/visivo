import click
from visivo.commands.options import (
    dist_dir,
    output_dir,
)


@click.command()
@output_dir
@dist_dir
def dist(output_dir, dist_dir):
    """
    Creates a distributable version of this dashboard and stores it in a 'dist' folder.
    This folder can be statically deployed to any web server, hosting service, or bucket storage.

    Note: Make sure to run `visivo run` before running `visivo dist`.
    """
    from visivo.logger.logger import Logger

    Logger.instance().debug("Creating Dist")

    from visivo.commands.dist_phase import dist_phase

    dist_phase(
        output_dir=output_dir,
        dist_dir=dist_dir,
    )
    Logger.instance().success(f"Created dist folder: {dist_dir}")
