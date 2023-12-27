import os
import click
from enum import Enum
import time
from halo import Halo
from visivo.logging.singleton import Singleton


class TypeEnum(str, Enum):
    console = "console"
    spinner = "spinner"


@Singleton
class Logger:
    def __init__(self):
        self.set_type(TypeEnum.console)

    def set_type(self, type: TypeEnum):
        self.type = type
        if type == TypeEnum.console or os.environ.get("CI") == "true":
            self.echo = click.echo
            self.spinner = None
        else:
            self.spinner = Halo(text="Loading", spinner="dots")
            self.spinner.start()
            time.sleep(0.1)
            self.echo = None

    def debug(self, message: str):
        if self.echo:
            self.echo(message)
        elif self.spinner:
            self.spinner.text = message

    def info(self, message: str):
        if self.echo:
            self.echo(message)
        elif self.spinner:
            self.spinner.info(text=message)

    def success(self, message: str):
        if self.echo:
            self.echo(message)
        elif self.spinner:
            self.spinner.succeed(text=message)

    def error(self, message: str):
        if self.echo:
            self.echo(message)
        elif self.spinner:
            self.spinner.stop_and_persist(text=message)
