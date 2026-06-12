import click
from visivo.commands.options import output_dir, working_dir, source, no_deprecation_warnings


@click.command()
@source
@working_dir
@output_dir
@no_deprecation_warnings
def test(output_dir, working_dir, source, no_deprecation_warnings):
    """
    Runs the project's tests, asserting on computed insight values to ensure the charts being produced have the characteristics that you expect.
    """
    from visivo.logger.logger import Logger

    Logger.instance().debug("Testing")

    from visivo.commands.test_phase import test_phase

    test_phase(
        default_source=source,
        output_dir=output_dir,
        working_dir=working_dir,
        no_deprecation_warnings=no_deprecation_warnings,
    )
    Logger.instance().success("Done")
