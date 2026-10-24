"""Run-only CLI without loading the server or other commands.

python -m visivo.runner_binary run --working-dir W --output-dir O [--dag-filter F]
"""

import click

from visivo.commands.run import run
from visivo.version import VISIVO_VERSION


@click.group()
@click.version_option(version=VISIVO_VERSION)
def visivo():
    pass


visivo.add_command(run)


if __name__ == "__main__":
    visivo()
