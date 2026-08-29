import click
from visivo.commands.options import (
    output_dir,
    working_dir,
    source,
    no_deprecation_warnings,
    json_output,
)


@click.command()
@source
@working_dir
@output_dir
@no_deprecation_warnings
@json_output
def test(output_dir, working_dir, source, no_deprecation_warnings, json_output):
    """
    Runs the project's tests, asserting on computed insight values to ensure the charts being produced have the characteristics that you expect.
    """
    from visivo.logger.logger import Logger

    Logger.instance().debug("Testing")

    def _test(defer_exit):
        from visivo.commands.test_phase import test_phase

        return test_phase(
            default_source=source,
            output_dir=output_dir,
            working_dir=working_dir,
            no_deprecation_warnings=no_deprecation_warnings,
            defer_exit=defer_exit,
        )

    if json_output:
        from visivo.commands.json_output import json_command, test_errors, test_result

        with json_command("test") as state:
            project, test_run = _test(defer_exit=True)
            state["result"] = test_result(test_run=test_run, project=project, output_dir=output_dir)
            state["errors"] = test_errors(test_run, project=project)
        return

    _test(defer_exit=False)
    Logger.instance().success("Done")
