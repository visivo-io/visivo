from enum import Enum
from typing import List, Optional
from pydantic import Field, field_serializer, model_validator

from visivo.models.alert import Alert
from visivo.models.base.base_model import BaseModel
from visivo.models.base.eval_string import EvalString
from visivo.models.base.named_model import NamedModel
from visivo.models.base.parent_model import ParentModel


class OnFailureEnum(str, Enum):
    exit = "exit"
    continue_ = "continue"


class Test(NamedModel, ParentModel):
    """
    Tests allow you to assert on the computed values that are the output of an
    insight. Tests are run with the `visivo test` command.

    ### Example
    ``` yaml
    tests:
      - name: Test One
        if: ">{ ${ ref(Tested Insight).props.type } == 'scatter' }"
        assertions:
          - ">{ sum( ${ ref(Tested Insight).props.x } ) == 7 }"
          - ">{ ${ ref(Tested Insight).props.x[0] } == 1 }"
    ```

    !!! note
        Quote each `>{ ... }` assertion (as above). Unquoted, YAML reads a
        leading `>` as a folded block-scalar indicator, so the assertion never
        reaches the parser as an eval string.

    The [numpy](https://numpy.org/doc/stable/index.html) library is available
    in test expressions.
    """

    if_: Optional[EvalString] = Field(
        None,
        alias="if",
        description="An optional eval string that gates the test; the assertions only run when it evaluates to true.",
    )
    on_failure: OnFailureEnum = Field(
        OnFailureEnum.exit,
        description="Whether a failure stops the test run (`exit`) or lets the remaining tests run (`continue`).",
    )
    assertions: List[EvalString] = Field(
        [],
        description="A list of eval strings (`>{ ... }`) that must all evaluate to true for the test to pass.",
    )

    @model_validator(mode="before")
    def rename_if(cls, values):
        if "if_" in values:
            values["if"] = values["if_"]
            del values["if_"]
        return values

    __test__ = False

    def child_items(self):
        # `child_items` runs during DAG construction AND name traversal (the
        # after-validator on every project load), so it must tolerate a test
        # authored with no assertions (default []) or an explicit `assertions:`
        # null — otherwise a stub test would crash validation for EVERY command.
        assertion_contexts = set()
        for assertion in self.assertions or []:
            assertion_contexts.update(assertion.get_context_strings())
        if self.if_:
            assertion_contexts.update(self.if_.get_context_strings())
        return list(assertion_contexts)
