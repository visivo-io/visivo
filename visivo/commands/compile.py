import click
from visivo.commands.json_output import json_output
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
@json_output
def compile(
    working_dir, output_dir, source, dbt_profile, dbt_target, no_deprecation_warnings, json_output
):
    """
    Parses the files in your working directory, extracting visivo configurations and then using those configurations to build the insight queries in your output directory. Queries are not run on compile, just written.
    """
    from visivo.logger.logger import Logger

    def _compile():
        Logger.instance().info("Compiling")

        from visivo.commands.compile_phase import compile_phase

        return compile_phase(
            default_source=source,
            working_dir=working_dir,
            output_dir=output_dir,
            dbt_profile=dbt_profile,
            dbt_target=dbt_target,
            no_deprecation_warnings=no_deprecation_warnings,
        )

    if json_output:
        from visivo.commands.json_output import compile_result, json_command

        with json_command("compile") as state:
            project = _compile()
            state["result"] = compile_result(
                project=project, working_dir=working_dir, output_dir=output_dir
            )
        return

    _compile()
    Logger.instance().success("Done")
