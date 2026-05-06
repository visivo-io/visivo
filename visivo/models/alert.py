from typing import List
from pydantic import Field, PrivateAttr, ConfigDict, field_serializer, model_validator

from visivo.models.base.eval_string import EvalString
from visivo.models.destinations.fields import DestinationField
from visivo.models.test_run import TestRun
from visivo.models.base.named_model import NamedModel

"""
Alerts fire when their `if` expression evaluates to true after a `visivo
test` run. They forward the result to one or more destinations (Slack,
email, console, etc.).

### Example
``` yaml
alerts:
    - name: Example Alert
      if: >{ anyTestFailed() && env.ENVIRONMENT == "PRODUCTION" }
      destinations:
        - ${ ref(Production Slack) }
        - ${ ref(Production Email) }
```
"""


class Alert(NamedModel):
    model_config = ConfigDict(populate_by_name=True)
    if_: EvalString = Field(
        None,
        alias="if",
        description="A EvalString that must evaluate to true for the alert to fire",
    )
    destinations: List[DestinationField] = []

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
