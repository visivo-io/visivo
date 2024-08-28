import click
from visivo.commands.options import (
    dist_dir,
    name_filter,
    output_dir,
    source,
    threads,
    working_dir,
)


@click.command()
@source
@working_dir
@output_dir
@dist_dir
@name_filter
@threads
def dist(output_dir, working_dir, dist_dir, source, name_filter, threads):
    """
    Creates a distributable version of this dashboard and stores it in a 'dist' folder.
    This folder can be statically deployed to any web server, hosting service, or bucket storage.
    """
    from visivo.logging.logger import Logger

    Logger.instance().debug("Creating Dist")

    from visivo.commands.dist_phase import dist_phase

    dist_phase(
        output_dir=output_dir,
        working_dir=working_dir,
        dist_dir=dist_dir,
        default_source=source,
        name_filter=name_filter,
        threads=threads,
    )
    Logger.instance().success(f"Created dist folder")
