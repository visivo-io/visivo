import click


@click.command()
def init():
    """
    Enables a quick set up by writing your target & api credentials to an env file.
    """
    from visivo.commands.logger import Logger

    Logger().info("Initializing")

    from visivo.commands.init_phase import init_phase

    init_phase()
    Logger().success("Done")