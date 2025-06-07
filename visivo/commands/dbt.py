import click
from visivo.commands.options import (
    working_dir,
    output_dir,
    dbt_profile,
    dbt_target,
)


@click.command()
@working_dir
@output_dir
@dbt_profile
@dbt_target
def dbt(working_dir, output_dir, dbt_profile, dbt_target):
    """
    Refreshes the dbt objects in the for use in Visivo.
    """
    from visivo.logger.logger import Logger

    Logger.instance().debug("Refreshing dbt models and sources.")

    from visivo.commands.dbt_phase import dbt_phase

    dbt_phase(
        working_dir=working_dir,
        output_dir=output_dir,
        dbt_profile=dbt_profile,
        dbt_target=dbt_target,
    )
    Logger.instance().success("Refreshed dbt models and sources.")
