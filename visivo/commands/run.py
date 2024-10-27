import click
from visivo.commands.options import (
    output_dir,
    working_dir,
    source,
    name_filter,
    threads,
    dbt_profile,
    dbt_target,
)


@click.command()
@source
@working_dir
@output_dir
@name_filter
@threads
@dbt_profile
@dbt_target
def run(output_dir, working_dir, source, name_filter, threads, dbt_profile, dbt_target):
    """
    Compiles the project and then runs the trace queries to fetch data to populate in the traces. Writes all data to the source directory.
    """

    from visivo.logging.logger import Logger

    Logger.instance().debug("Running")

    from visivo.commands.run_phase import run_phase

    run_phase(
        default_source=source,
        output_dir=output_dir,
        working_dir=working_dir,
        name_filter=name_filter,
        threads=threads,
        dbt_profile=dbt_profile,
        dbt_target=dbt_target,
    )
    Logger.instance().success("Done")
