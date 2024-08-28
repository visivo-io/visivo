from typing import Literal, Union
from typing_extensions import Annotated
from pydantic import Field
import smtplib
import click
import json
from ..base.named_model import NamedModel
from ..test_run import TestRun
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


class Destination(NamedModel):
    def alert(self, test_run: TestRun):
        raise NotImplementedError("Please Implement this method")









DestinationField = Annotated[
    Union[SlackDestination, EmailDestination, ConsoleDestination],
    Field(discriminator="type"),
]
