import click
from visivo.commands.options import project_dir


@click.command()
@project_dir
def init(project_dir):
    """
    Enables a quick set up by writing your source & api credentials to an env file.
    """
    from visivo.logging.logger import Logger

    Logger.instance().debug("Init")

    from visivo.commands.init_phase import init_phase

    init_phase(project_dir)
    Logger.instance().success("Done")
