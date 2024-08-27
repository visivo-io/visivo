from typing import List, Optional
from pydantic import Field

from visivo.models.alert import Alert
from visivo.models.base.context_string import ContextString
from .base.base_model import BaseModel, StringOrList

"""
Tests allow you to assert on the computed values that are the output of a trace.  The tests are run with the `visivo test` command.

### Example
``` yaml
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
            - assert_that(numpy.sum(Tested Trace.props.x)).is_equal_to(7)
          alerts:
            - ${ ref(Alert One) }
```
The [assertpy](https://assertpy.github.io/) and [numpy](https://numpy.org/doc/stable/index.html) libraries are available for testing.
"""


class OnFailureEnum(str, Enum):
    exit = "exit"
    continue_ = "continue"


class Test(BaseModel):
    if_: Optional[ContextString] = Field(None, alias="if")
    on_failure: OnFailureEnum = Field(OnFailureEnum.exit)
    assertions: List[ContextString] = Field(None)
    alerts: List[Alert] = Field([], "Alerts that will be triggered")

    __test__ = False
