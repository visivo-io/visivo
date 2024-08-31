import json
from typing import Literal

from pydantic import Field, ImportString
from visivo.models.destinations.destination import Destination
from visivo.models.test_run import TestRun


class SlackDestination(Destination):
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
        description="The type of Destination Destination. Needs to be `slack` to configure a slack destination",
    )

    def alert(self, test_run: TestRun):
        import requests

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
