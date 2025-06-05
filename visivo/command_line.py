from time import time

start_time = time()
from visivo.logging.logger import Logger, TypeEnum

Logger.instance().info("Starting Visivo...")
import click
import os
from dotenv import load_dotenv
from pydantic import ValidationError
import sys

from visivo.parsers.line_validation_error import LineValidationError

from .commands.dbt import dbt
from .commands.deploy import deploy
from .commands.serve import serve
from .commands.run import run
from .commands.dist import dist
from .commands.compile import compile
from .commands.init import init
from .commands.create import create
from .commands.test import test
from .commands.aggregate import aggregate
from .commands.archive import archive
from .commands.authorize import authorize
from .commands.install import install
from .version import VISIVO_VERSION


@click.group()
@click.option("-p", "--profile", is_flag=True)
@click.option("-e", "--env-file", default=".env")
@click.version_option(version=VISIVO_VERSION)
def visivo(env_file, profile):
    Logger.instance().set_type(TypeEnum.spinner)
    load_env(env_file)

    # Profiling can be done with https://github.com/nschloe/tuna
    #  `tuna visivo-profile.dmp`
    # If you need to profile the import time, you can use the following command:
    #  `python -X importtime -m visivo.command_line compile 2> import.log`
    #  `tuna import.log`
    if profile:
        import cProfile
        import atexit

        Logger.instance().info("Profiling...")
        pr = cProfile.Profile()
        pr.enable()

        def exit():
            pr.disable()
            Logger.instance().info("Profiling completed")
            pr.dump_stats("visivo-profile.dmp")

        atexit.register(exit)


visivo.add_command(init)
visivo.add_command(dbt)
visivo.add_command(compile)
visivo.add_command(run)
visivo.add_command(serve)
visivo.add_command(deploy)
visivo.add_command(dist)
visivo.add_command(test)
visivo.add_command(aggregate)
visivo.add_command(archive)
visivo.add_command(authorize)
visivo.add_command(create)
visivo.add_command(install)


def load_env(env_file):
    if os.path.isfile(env_file):
        Logger.instance().debug(f"Loading env file: {env_file}")
        load_dotenv(env_file)


def print_issue_url():
    import traceback
    import urllib.parse

    stack_trace = "".join(traceback.format_exc())
    command = " ".join(sys.argv)
    issue_body = f"Command: {command}\n\nStack Trace:\n```\n{stack_trace}\n```"
    encoded_body = urllib.parse.quote(issue_body)
    issue_url = f"https://github.com/visivo-io/visivo/issues/new?body={encoded_body}"

    Logger.instance().error(
        f"\x1b]8;;{issue_url}\x1b\\Click here to report this issue\x1b]8;;\x1b\\"
    )


def safe_visivo():
    try:
        visivo(standalone_mode=False)
        Logger.instance().info(f"Visivo execution time: {round(time() - start_time, 2)}s")
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
        print_issue_url()
        exit(1)


if __name__ == "__main__":
    safe_visivo()
