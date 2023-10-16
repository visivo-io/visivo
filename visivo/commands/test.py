import click
from visivo.commands.options import output_dir, working_dir, target, alert


@click.command()
@target
@working_dir
@output_dir
@alert
def test(output_dir, working_dir, target, alert):
    """
    Enables testing trace values to ensure that the charts that are being produced have the characteristics that you would expect.
    """
    from visivo.logging.logger import Logger

    Logger.instance().debug("Testing")

    from visivo.commands.test_phase import test_phase

    test_phase(
        default_target=target,
        output_dir=output_dir,
        working_dir=working_dir,
        alert_names=alert,
    )
    Logger.instance().success("Done")
