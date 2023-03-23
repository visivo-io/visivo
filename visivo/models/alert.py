from typing import Literal
import requests
import json
from .base_model import BaseModel
from .test_run import TestRun


class Alert(BaseModel):
    def alert(self, test_run: TestRun):
        raise NotImplementedError("Please Implement this method")


class TestAlert(Alert):
    called: bool = False
    type: Literal["test"]

    def alert(self, test_run: TestRun):
        self.called = True

    __test__ = False


class EmailAlert(Alert):
    type: Literal["email"]
    pass


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
