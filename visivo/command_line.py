import click
import os

from .commands.deploy import deploy
from .commands.serve import serve
from .commands.run import run
from .commands.compile import compile
from .commands.init import init
from .commands.test import test
from .commands.aggregate import aggregate


@click.group()
def visivo():
    pass


visivo.add_command(init)
visivo.add_command(compile)
visivo.add_command(run)
visivo.add_command(serve)
visivo.add_command(deploy)
visivo.add_command(test)
visivo.add_command(aggregate)

if __name__ == "__main__":
    visivo()
