from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import smtplib
from typing import Literal

from pydantic import Field

from visivo.models.destinations.destination import Destination
from visivo.models.test_run import TestRun


class EmailDestination(Destination):
    """
    You can configure email destinations for any SMTP provider. Here's an example of this configuration looks in your yaml file:
    ``` yaml
    destinations:
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
    subject: str = Field("Visivo Destination", description="Subject of the alert email.")
    to: str = Field(None, description="The email to send the alert to.")
    port: int = Field(
        2525,
        description="The port of the email server that the destination is connecting to.",
    )
    host: str = Field(
        None,
        description="The host of the email server that the destination is connecting to.",
    )
    username: str = Field(None, description="The username for authenticating the email server.")
    password: str = Field(None, description="The password for authenticating the email server.")

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
