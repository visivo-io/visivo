from typing import List
from pydantic import Field, PrivateAttr, ConfigDict, field_serializer, model_validator

from visivo.models.base.eval_string import EvalString
from visivo.models.destinations.fields import DestinationField
from visivo.models.test_run import TestRun
from visivo.models.base.named_model import NamedModel


class Alert(NamedModel):
    """
    Alerts fire when their `if` expression evaluates to true after a `visivo
    test` run. They forward the result to one or more destinations (Slack,
    email, console).

    The `if` expression is a `>{ ... }` eval string. The `anyTestFailed()`
    helper returns true when at least one test in the run failed, and
    `env.VARIABLE_NAME` exposes environment variables so you can scope
    alerts to specific environments.

    ### Example
    ``` yaml
    alerts:
        - name: Example Alert
          if: '>{ anyTestFailed() && env.ENVIRONMENT == "PRODUCTION" }'
          destinations:
            - name: Production Slack
              type: slack
              webhook_url: ${env.SLACK_WEBHOOK}
            - name: Production Email
              type: email
              to: data-team@your_company.com
              host: your_company_email_server.com
              username: alerts
              password: ${env.EMAIL_PASSWORD}
    ```
    """

    model_config = ConfigDict(populate_by_name=True)
    if_: EvalString = Field(
        None,
        alias="if",
        description="An eval string (`>{ ... }`) that must evaluate to true for the alert to fire.",
    )
    destinations: List[DestinationField] = Field(
        [],
        description="Destination objects, defined inline on the alert, that it notifies when it fires. Only concrete destinations are accepted here: a reference to a top-level `destinations:` entry is not resolved on this field.",
    )

    _parent_test: str = PrivateAttr(default=None)

    @model_validator(mode="before")
    def rename_if(cls, values):
        if "if_" in values:
            values["if"] = values["if_"]
            del values["if_"]
        return values

    def set_parent_test(self, value: str):
        self._parent_test = value

    def alert(self, test_run: TestRun):
        for destination in self.destinations:
            destination.alert(test_run=test_run)
