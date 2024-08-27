from enum import Enum
from typing import List, Optional
from pydantic import Field

from visivo.models.base.context_string import ContextString
from visivo.models.destination import DestinationField
from .base.named_model import NamedModel


"""
Tests allow you to assert on the computed values that are the output of a trace.  The tests are run with the `visivo test` command.

### Example
``` yaml
alerts:
    - name: Example Alert
      if: ${ anyTestFailed() && env == PRODUCTION }
      - destinations: 
        - ${ ref(Production Slack) }
        - ${ ref(Production Email) }
```
"""


class Alert(NamedModel):
    if_: Optional[ContextString] = Field(None, alias="if", description="A")
    destinations: List[DestinationField] = []
