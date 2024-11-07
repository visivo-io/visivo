from enum import Enum
from typing import List, Optional
from pydantic import Field, model_validator

from visivo.models.alert import Alert
from visivo.models.base.base_model import BaseModel
from visivo.models.base.eval_string import EvalString
from visivo.models.base.named_model import NamedModel
from visivo.models.base.parent_model import ParentModel

"""
Tests allow you to assert on the computed values that are the output of a trace.  The tests are run with the `visivo test` command.

### Example
``` yaml
tests:
  - name: Test One
    if: ${ ref(Tested Trace).props.type } == "scatter"
    assertions:
      - >{ sum( ${ ref(Tested Trace).props.x) } ) == 7 }
      - >{ ${ ref(Tested Trace).props.x[0] } == 1 } 
traces:
    - name: Tested Trace
      model: ref(model)
      columns:
          account_name: account_name
      props:
          type: scatter
          x: column(project_created_at)
          y: column(project_name)
      tests:
        - assertions: 
            - >{ sum( ${ ref(Tested Trace).props.x) } ) == 7 }
            - >{ ${ ref(Tested Trace).props.x[0] } == 1 } 
          alerts:
            - ${ ref(Alert One) }
```
The [numpy](https://numpy.org/doc/stable/index.html) libraries are available for testing.
"""


class OnFailureEnum(str, Enum):
    exit = "exit"
    continue_ = "continue"


class Test(NamedModel, ParentModel):
    if_: Optional[EvalString] = Field(None, alias="if")
    on_failure: OnFailureEnum = Field(OnFailureEnum.exit)
    assertions: List[EvalString] = Field(None)

    __test__ = False

    def child_items(self):
        assertion_contexts = set()
        for assertion in self.assertions:
            assertion_contexts.update(assertion.get_context_strings())
        if self.if_:
            assertion_contexts.update(self.if_.get_context_strings())
        return list(assertion_contexts)
