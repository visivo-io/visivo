import click
from visivo.commands.options import project_dir
from visivo.models.example_type import ExampleTypeEnum


@click.command()
@project_dir
@click.option(
    "--example",
    type=click.Choice([e.value for e in ExampleTypeEnum]),
    help="Load an example project from GitHub",
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
