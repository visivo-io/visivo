from typing import Union
from typing_extensions import Annotated
from pydantic import Field

from visivo.models.destinations.console_destination import ConsoleDestination
from visivo.models.destinations.email_destination import EmailDestination
from visivo.models.destinations.slack_destination import SlackDestination

DestinationField = Annotated[
    Union[SlackDestination, EmailDestination, ConsoleDestination],
    Field(discriminator="type"),
]
