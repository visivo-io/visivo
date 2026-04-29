import click
from visivo.commands.options import (
    output_dir,
    working_dir,
    source,
    dbt_profile,
    dbt_target,
    no_deprecation_warnings,
)


@click.command()
@source
@working_dir
@output_dir
@dbt_profile
@dbt_target
@no_deprecation_warnings
def compile(working_dir, output_dir, source, dbt_profile, dbt_target, no_deprecation_warnings):
    """
    Parses the files in your working directory, extracting visivo configurations and then using those configurations to build the trace queries and a project.json file in your source directory. Queries are not run on compile, just written.
    """
    from visivo.logger.logger import Logger
    from visivo.parsers.line_validation_error import LineValidationError

    Logger.instance().info("Compiling")

    from visivo.commands.compile_phase import compile_phase

    try:
        compile_phase(
            default_source=source,
            working_dir=working_dir,
            output_dir=output_dir,
            dbt_profile=dbt_profile,
            dbt_target=dbt_target,
            no_deprecation_warnings=no_deprecation_warnings,
        )
    except LineValidationError:
        # compile_phase has already written error.json and printed the
        # ⚠ Compile failed summary. Surface a non-zero exit code via Click so
        # CI runs and the user's terminal flag the failure cleanly.
        raise click.ClickException("Compile failed. See errors above.")

    Logger.instance().success("Done")
