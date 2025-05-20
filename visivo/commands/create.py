import click


@click.command()
@click.option("--project-name", type=str, help="The name of the project to initialize")
def create(project_name):
    """
    Enables a quick set up by writing your source & api credentials to an env file.
    """
    from visivo.logging.logger import Logger

    Logger.instance().debug("Create")

    from visivo.commands.create_phase import create_phase

    create_phase(project_name)
    Logger.instance().success("Done")
