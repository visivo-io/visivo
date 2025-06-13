import click
import os
from pathlib import Path
from visivo.logger.logger import Logger
from visivo.commands.init_phase import init_phase


def create_phase(project_name=None):
    """Enables a quick set up by writing your source & api credentials to an env file."""
    Logger.instance().success("Creating")
    if not project_name:
        project_name = click.prompt("? Project name", type=str)
    if Path(project_name).exists():
        raise click.ClickException(f"'{project_name}' directory already exists")

    os.makedirs(project_name, exist_ok=True)
    init_phase(project_name)
