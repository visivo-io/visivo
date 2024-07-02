import click
import os
import importlib
from dotenv import load_dotenv
from pydantic import ValidationError
from visivo.logging.logger import Logger, TypeEnum
from visivo.parsers.line_validation_error import LineValidationError

from .commands.deploy import deploy
from .commands.serve import serve
from .commands.run import run
from .commands.dist import dist
from .commands.compile import compile
from .commands.init import init
from .commands.test import test
from .commands.aggregate import aggregate
from .commands.archive import archive


@click.group()
@click.option("-e", "--env-file", default=".env")
@click.version_option(version=importlib.metadata.version("visivo"))
def visivo(env_file):
    Logger.instance().set_type(TypeEnum.spinner)
    load_env(env_file)


visivo.add_command(init)
visivo.add_command(compile)
visivo.add_command(run)
visivo.add_command(serve)
visivo.add_command(deploy)
visivo.add_command(dist)
visivo.add_command(test)
visivo.add_command(aggregate)
visivo.add_command(archive)


def load_env(env_file):
    if os.path.isfile(env_file):
        Logger.instance().debug(f"Loading env file: {env_file}")
        load_dotenv(env_file)


def safe_visivo():
    try:
        visivo(standalone_mode=False)
    except (ValidationError, LineValidationError) as e:
        Logger.instance().error(str(e))
        exit(1)
    except Exception as e:
        if "STACKTRACE" in os.environ and os.environ["STACKTRACE"] == "true":
            raise e
        Logger.instance().error("An unexpected error has occurred")
        Logger.instance().error(str(e))
        Logger.instance().error(
            "To print more error information add the 'STACKTRACE=true' environment variable."
        )
        exit(1)


if __name__ == "__main__":
    safe_visivo()
