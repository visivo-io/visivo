from typing import Literal

import click
from pydantic import Field
from visivo.models.destinations.destination import Destination
from visivo.models.test_run import TestRun


class ConsoleDestination(Destination):
    """
    ConsoleDestinations print a message to the terminal when an alert fires.

    They are useful for trying out alerts locally or in CI logs before wiring
    up a Slack or email destination.

    !!! example

        ``` yaml
        destinations:
          - name: terminal
            type: console
            message: A test failed in the last run.
        ```
    """

    called: bool = Field(
        False, description="Set to true after the destination fires. You do not need to set this."
    )
    message: str = Field(
        "Console Destination Run", description="The message printed to the console."
    )
    type: Literal["console"]

    def alert(self, test_run: TestRun):
        click.echo(self.message)
        self.called = True
