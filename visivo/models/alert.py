from typing import Literal, List
import smtplib
import click
import requests
import json
from .base_model import BaseModel
from .test_run import TestRun
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


class Alert(BaseModel):
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
    type: Literal["email"]
    subject: str = "Visivo Alert"
    to: str
    port: int = 2525
    host: str
    username: str
    password: str

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
    webhook_url: str
    type: Literal["slack"]

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
