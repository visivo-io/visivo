from typing import Literal, Union
from typing_extensions import Annotated
from pydantic import Field
import smtplib
import click
import requests
import json
from .base.named_model import NamedModel
from .test_run import TestRun
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


class Alert(NamedModel):
    def alert(self, test_run: TestRun):
        raise NotImplementedError("Please Implement this method")


class ConsoleAlert(Alert):
    called: bool = False
    message: str = "Console Alert Run"
    type: Literal["console"]

    def alert(self, test_run: TestRun):
        click.echo(self.message)
        self.called = True


class EmailAlert(Alert):
    """
    You can configure email alert destinations for any SMTP provider. Here's an example of this configuration looks in your yaml file:
    ``` yaml
    alerts:
      - name: email-destination #any unique name of your choosing
        type: email
        subject: "[ALERT] Your Visivo Tests Have Failed" #can be any message you want
        to: someone@your_company.com
        port: 2525 #is this port by default
        host: your_company_email_server.com
        username: someones_username
        password: {% raw %}{{ env_var('EMAIL_PASSWORD')}}{% endraw %} #We'd recommend using environment variables here for security

    ```
    """

    type: Literal["email"] = Field(None, description="The type of alert destination.")
    subject: str = Field("Visivo Alert", description="Subject of the alert email.")
    to: str = Field(None, description="The email to send the alert to.")
    port: int = Field(
        2525,
        description="The port of the email server that the destination is connecting to.",
    )
    host: str = Field(
        None,
        description="The host of the email server that the destination is connecting to.",
    )
    username: str = Field(
        None, description="The username for authenticating the email server."
    )
    password: str = Field(
        None, description="The password for authenticating the email server."
    )

    def alert(self, test_run: TestRun):
        if not test_run.failures:
            return

        body = f"There were test failures running against {test_run.target_name}\n\n"

        for test_failure in test_run.failures:
            body += f"* {test_failure.test_id} - {test_failure.message}\n"

        sender_email = "alerts@visio.io"

        message = MIMEMultipart("alternative")
        message["Subject"] = self.subject
        message["From"] = sender_email
        message["To"] = self.to

        html = f"""\
        <html>
        <body>
            {body}
        </body>
        </html>
        """

        part1 = MIMEText(body, "plain")
        part2 = MIMEText(html, "html")
        message.attach(part1)
        message.attach(part2)

        with smtplib.SMTP(self.host, self.port) as server:
            server.login(self.login, self.password)
            server.sendmail(sender_email, self.to, message.as_string())


class SlackAlert(Alert):
    """
    You can configure slack alerts by setting up an incoming message slack webhook. Once you do that, the set up in Visivo is super simple:
    ``` yaml
    alerts:
      - name: slack-destination #any name you choose
        type: slack
        webhook_url: {% raw %}{{ env_var("SLACK_WEBHOOK")}}{% endraw %}
    ```
    """

    webhook_url: str = Field(
        None,
        description="An incoming message slack webhook url. You can set one of those up by following <a href='https://api.slack.com/messaging/webhooks'>these instructions</a>.",
    )
    type: Literal["slack"] = Field(
        None,
        description="The type of Alert Destination. Needs to be `slack` to configure a slack destination",
    )

    def alert(self, test_run: TestRun):
        json_headers = {"content-type": "application/json"}

        if not test_run.failures:
            return

        body = {
            "blocks": [
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"There were test failures running against {test_run.target_name}",
                    },
                }
            ]
        }

        test_failures = ""
        for test_failure in test_run.failures:
            test_failures += f"* {test_failure.test_id} - {test_failure.message}\n"

        body["blocks"].append(
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"{test_failures}",
                },
            }
        )

        requests.post(self.webhook_url, data=json.dumps(body), headers=json_headers)


AlertField = Annotated[
    Union[SlackAlert, EmailAlert, ConsoleAlert], Field(discriminator="type")
]
