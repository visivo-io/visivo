import click
from visivo.commands.options import output_dir, working_dir, source


@click.command()
@source
@working_dir
@output_dir
def test(output_dir, working_dir, source):
    """
    Enables testing trace values to ensure that the charts that are being produced have the characteristics that you would expect.
    """
    from visivo.logging.logger import Logger

    Logger.instance().debug("Testing")

    from visivo.commands.test_phase import test_phase

    test_phase(
        default_source=source,
        output_dir=output_dir,
        working_dir=working_dir,
    )
    Logger.instance().success("Done")
