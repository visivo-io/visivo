import click
from visivo.commands.json_output import json_output
from visivo.commands.options import (
    working_dir,
    output_dir,
    dag_filter,
    source,
    threads,
    dbt_profile,
    dbt_target,
    skip_compile,
    port,
    no_deprecation_warnings,
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
@port
@no_deprecation_warnings
@json_output
def run(
    output_dir,
    working_dir,
    source,
    dag_filter,
    threads,
    dbt_profile,
    dbt_target,
    skip_compile,
    port,
    no_deprecation_warnings,
    json_output,
):
    """
    Compiles the project and then runs the model and insight queries to fetch the data that powers your dashboards. Writes all data to the output directory. Can skip the compile with the --skip-compile flag.
    """
    from visivo.logger.logger import Logger
    from visivo.commands.parse_project_phase import parse_project_phase

    Logger.instance().debug("Running")

    def _run(defer_exit):
        project = parse_project_phase(
            working_dir=working_dir,
            output_dir=output_dir,
            default_source=source,
            dbt_profile=dbt_profile,
            dbt_target=dbt_target,
        )

        from visivo.commands.run_phase import run_phase

        runner = run_phase(
            default_source=source,
            output_dir=output_dir,
            working_dir=working_dir,
            dag_filter=dag_filter,
            threads=threads,
            dbt_profile=dbt_profile,
            dbt_target=dbt_target,
            skip_compile=skip_compile,
            project=project,
            no_deprecation_warnings=no_deprecation_warnings,
            defer_exit=defer_exit,
        )
        return project, runner

    if json_output:
        from visivo.commands.json_output import json_command, run_errors, run_result

        with json_command("run") as state:
            project, runner = _run(defer_exit=True)
            state["result"] = run_result(runner=runner, project=project, output_dir=output_dir)
            state["errors"] = run_errors(runner)
        return

    _run(defer_exit=False)

    Logger.instance().success("Done")
