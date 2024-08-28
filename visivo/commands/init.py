import click


@click.command()
def init():
    """
    Enables a quick set up by writing your source & api credentials to an env file.
    """
    from visivo.logging.logger import Logger

    Logger.instance().debug("Initializing")

    from visivo.commands.init_phase import init_phase

    init_phase()
    Logger.instance().success("Done")
