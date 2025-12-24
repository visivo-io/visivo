import click
from visivo.commands.options import output_dir, working_dir, source, no_deprecation_warnings


@click.command()
@source
@working_dir
@output_dir
@no_deprecation_warnings
def test(output_dir, working_dir, source, no_deprecation_warnings):
    """
    Enables testing trace values to ensure that the charts that are being produced have the characteristics that you would expect.
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
