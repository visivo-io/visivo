import click
from visivo.commands.options import (
    working_dir,
)


@click.command()
@working_dir
def dbt(working_dir):
    """
    Refreshes the dbt objects in the for use in Visivo.
    """
    from visivo.logging.logger import Logger

    Logger.instance().debug("Refreshingdbt objects")

    from visivo.commands.dbt_phase import dbt_phase

    dbt_phase(
        working_dir=working_dir,
    )
    Logger.instance().success(f"Refreshed dbt objects")
