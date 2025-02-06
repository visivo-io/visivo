import click
from visivo.commands.options import (
    working_dir,
    output_dir,
    dag_filter,
    source,
    threads,
    dbt_profile,
    dbt_target,
    skip_compile,
    thumbnail_mode,
)


@click.command()
@working_dir
@output_dir
@dag_filter
@source
@threads
@dbt_profile
@dbt_target
@skip_compile
@thumbnail_mode
def run(output_dir, working_dir, source, dag_filter, threads, dbt_profile, dbt_target, thumbnail_mode, skip_compile):
    """
    Compiles the project and then runs the trace queries to fetch data to populate in the traces. Writes all data to the source directory. Can skip the compile with the --skip-compile flag.
    """

    from visivo.logging.logger import Logger
    Logger.instance().debug("Running")

    from visivo.commands.run_phase import run_phase
    run_phase(
        default_source=source,
        output_dir=output_dir,
        working_dir=working_dir,
        dag_filter=dag_filter,
        threads=threads,
        dbt_profile=dbt_profile,
        dbt_target=dbt_target,
        thumbnail_mode=thumbnail_mode,
        skip_compile=skip_compile,
    )

    Logger.instance().success("Done")
