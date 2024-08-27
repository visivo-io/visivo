from enum import Enum
from typing import List, Optional
from pydantic import Field

from visivo.models.base.context_string import ContextString
from visivo.models.destination import DestinationField
from .base.named_model import NamedModel




class Alert(NamedModel):
    if_: Optional[ContextString] = Field(None, alias="if")
    on_failure: OnFailureEnum = OnFailureEnum.exit
    destinations: List[DestinationField] = []
