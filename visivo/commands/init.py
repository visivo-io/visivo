import click
from visivo.commands.options import project_dir


@click.command()
@project_dir
@click.option(
    "--example",
    type=str,
    help="Load an example project from GitHub (e.g., 'github-releases')",
    default=None,
)
def init(project_dir, example):
    """
    Initialize a new Visivo project.

    By default, creates a simple project.visivo.yml file with a project name.
    Use --example to load an example project from GitHub.
    """
    from visivo.logger.logger import Logger

    Logger.instance().debug("Init")

    from visivo.commands.init_phase import init_phase

    init_phase(project_dir, example)

    Logger.instance().success("Done")
