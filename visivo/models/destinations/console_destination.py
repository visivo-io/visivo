from typing import Literal

import click
from visivo.models.destinations.destination import Destination
from visivo.models.test_run import TestRun


class ConsoleDestination(Destination):
    called: bool = False
    message: str = "Console Destination Run"
    type: Literal["console"]

    def alert(self, test_run: TestRun):
        click.echo(self.message)
        self.called = True
