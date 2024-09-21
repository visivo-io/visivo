import click
from visivo.commands.options import (
    output_dir,
    working_dir,
    source,
    name_filter,
    threads,
)


@click.command()
@source
@working_dir
@output_dir
@name_filter
@threads
def run(output_dir, working_dir, source, name_filter, threads):
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
    )
    Logger.instance().success("Done")
