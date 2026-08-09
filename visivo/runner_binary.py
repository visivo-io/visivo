"""Single-command ``visivo run`` entry for the cloud runner binary (VIS-1192).

The runner's workhorse is ``visivo run`` — it never needs the other commands. A
run-only entry keeps the binary small and, crucially, sidesteps the Nuitka 4.1.3
crash that including the whole (lazily-loaded) ``visivo.commands`` package
triggers: here ``run`` is a plain import that Nuitka's normal import-following
handles (the path the VIS-1190 spike proved works), not an explicit
``--include-module`` of the command package (which crashes Nuitka's DLL scan).

Invoked as::

    visivo-run run --working-dir W --output-dir O [--dag-filter F]
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
