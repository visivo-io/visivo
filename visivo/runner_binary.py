"""Run-only CLI without loading the server or other commands.

python -m visivo.runner_binary run --working-dir W --output-dir O [--dag-filter F]
"""

import os
import sys

import click
from pydantic import ValidationError

from visivo.commands.run import run
from visivo.logger.logger import Logger
from visivo.parsers.line_validation_error import LineValidationError
from visivo.version import VISIVO_VERSION


@click.group()
@click.version_option(version=VISIVO_VERSION)
def visivo():
    pass


visivo.add_command(run)


def main(args=None):
    """A project error is the user's to fix, so it prints as the message, not a trace."""
    try:
        visivo.main(args=args, standalone_mode=False)
    except (ValidationError, LineValidationError) as error:
        if os.environ.get("STACKTRACE") == "true":
            raise
        Logger.instance().error(str(error))
        sys.exit(1)
    except click.ClickException as error:
        error.show()
        sys.exit(error.exit_code)
    except click.exceptions.Exit as exit_:
        sys.exit(exit_.exit_code)
    except click.exceptions.Abort:
        sys.exit(1)


if __name__ == "__main__":
    main()
