import os
import click
from halo import Halo
from enum import Enum


class Logger:
    class TypeEnum(str, Enum):
        console = "console"
        spinner = "spinner"

    def __new__(cls, type: TypeEnum = TypeEnum.console):
        if not hasattr(cls, "instance"):
            cls.instance = super(Logger, cls).__new__(cls)
        return cls.instance

    def __init__(self, type: TypeEnum = TypeEnum.console):
        self.echo = None
        self.spinner = None

        if os.getenv("CI") or type == Logger.TypeEnum.console:
            self.echo = click.echo
        else:
            click.echo("CALLED")
            self.spinner = Halo(text="Loading", spinner="dots")
            self.spinner.start()

    def info(self, message: str):
        if self.echo:
            self.echo(message)
        elif self.spinner:
            self.spinner.text = message

    def success(self, message: str):
        if self.echo:
            self.echo(message)
        elif self.spinner:
            self.spinner.succeed(message)
