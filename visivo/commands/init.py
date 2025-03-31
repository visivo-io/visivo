import click


@click.command()
@click.option("--project-name", type=str, help="The name of the project to initialize")
def init(project_name):
    """
    Enables a quick set up by writing your source & api credentials to an env file.
    """
    from visivo.logging.logger import Logger

    Logger.instance().debug("Initializing")

    from visivo.commands.init_phase import init_phase

    init_phase(project_name)
    Logger.instance().success("Done")
