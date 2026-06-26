import click
from visivo.commands.options import (
    working_dir,
    output_dir,
    source,
    dbt_profile,
    dbt_target,
    dist_dir,
    deployment_root,
)


@click.command()
@working_dir
@output_dir
@source
@dbt_profile
@dbt_target
@dist_dir
@deployment_root
def dist(working_dir, output_dir, source, dbt_profile, dbt_target, dist_dir, deployment_root):
    """
    Creates a distributable version of this dashboard and stores it in a 'dist' folder.
    This folder can be statically deployed to any web server, hosting service, or bucket storage.

    Note: Make sure to run `visivo run` before running `visivo dist`.
    """
    from visivo.logger.logger import Logger

    Logger.instance().debug("Creating Dist")

    from visivo.commands.dist_phase import dist_phase

    dist_phase(
        working_dir=working_dir,
        output_dir=output_dir,
        default_source=source,
        dbt_profile=dbt_profile,
        dbt_target=dbt_target,
        dist_dir=dist_dir,
        deployment_root=deployment_root,
    )
    Logger.instance().success(f"Created dist folder: {dist_dir}")
