import click
import os
from dotenv import load_dotenv

from .commands.deploy import deploy
from .commands.serve import serve
from .commands.run import run
from .commands.compile import compile
from .commands.init import init
from .commands.test import test
from .commands.aggregate import aggregate


@click.group()
@click.option("-e", "--env-file", default=".env")
def visivo(env_file):
    load_env(env_file)


visivo.add_command(init)
visivo.add_command(compile)
visivo.add_command(run)
visivo.add_command(serve)
visivo.add_command(deploy)
visivo.add_command(test)
visivo.add_command(aggregate)


def load_env(env_file):
    if os.path.isfile(env_file):
        load_dotenv(env_file)


def safe_visivo():
    try:
        visivo()
    except Exception as e:
        if "STACKTRACE" in os.environ and os.environ["STACKTRACE"] == "true":
            raise e
        click.echo("An unexpected error has occurred")
        click.echo(e)


if __name__ == "__main__":
    safe_visivo()
