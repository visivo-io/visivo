import click
from visivo.commands.options import (
    output_dir,
    working_dir,
    source,
    dbt_profile,
    dbt_target,
)


@click.command()
@source
@working_dir
@output_dir
@dbt_profile
@dbt_target
def compile(working_dir, output_dir, source, dbt_profile, dbt_target):
    """
    Parses the files in your working directory, extracting visivo configurations and then using those configurations to build the trace queries and a project.json file in your source directory. Queries are not run on compile, just written.
    """
    from visivo.logger.logger import Logger

    Logger.instance().info("Compiling")

    from visivo.commands.compile_phase import compile_phase

    compile_phase(
        default_source=source,
        working_dir=working_dir,
        output_dir=output_dir,
        dbt_profile=dbt_profile,
        dbt_target=dbt_target,
    )
    Logger.instance().success("Done")
