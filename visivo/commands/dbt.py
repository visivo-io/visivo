import click
from visivo.commands.options import (
    working_dir,
    output_dir,
    dbt_profile,
    dbt_target,
)

NO_DBT_BLOCK_MESSAGE = (
    "Nothing to refresh: the project has no enabled `dbt:` block. "
    "Add this to project.visivo.yml:\n\n"
    "dbt:\n"
    "  enabled: true\n\n"
    "See https://docs.visivo.io/reference/configuration/Dbt/ for the options."
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

    ran = dbt_phase(
        working_dir=working_dir,
        output_dir=output_dir,
        dbt_profile=dbt_profile,
        dbt_target=dbt_target,
    )
    if not ran:
        raise click.ClickException(NO_DBT_BLOCK_MESSAGE)
    Logger.instance().success("Refreshed dbt models and sources.")
