import os
import sys
import click
from enum import Enum
from halo import Halo
from visivo.logger.singleton import Singleton


class TypeEnum(str, Enum):
    console = "console"
    spinner = "spinner"


@Singleton
class Logger:
    def __init__(self):
        self.set_type(TypeEnum.console)

    def set_type(self, type: TypeEnum):
        self.type = type
        if type == TypeEnum.console or os.environ.get("CI") == "true" or not sys.stdout.isatty():
            self.echo = click.echo
            self.spinner = None
        else:
            self.spinner = Halo(text="Loading", spinner="dots")
            self.spinner.start()
            self.echo = None

    def debug(self, message: str):
        if os.environ.get("DEBUG") == "true":
            if self.echo:
                self.echo(message)
            elif self.spinner:
                self.spinner.info(text=str(message))

    def info(self, message: str):
        if self.echo:
            self.echo(message)
        elif self.spinner:
            self.spinner.info(text=str(message))

    def success(self, message: str):
        if self.echo:
            self.echo(message)
        elif self.spinner:
            self.spinner.succeed(text=str(message))

    def error(self, message: str):
        if self.echo:
            self.echo(message)
        elif self.spinner:
            self.spinner.fail(text=str(message))
