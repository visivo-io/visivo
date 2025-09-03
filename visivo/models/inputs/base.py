from datetime import date
from enum import Enum
from typing import List, Optional, Union

from pydantic import Field
from visivo.models.base.named_model import NamedModel


class InputTypes(str, Enum):
    dropdown = "dropdown"


class Input(NamedModel):
    type: InputTypes = Field(
        InputTypes.dropdown,
        description="Type of input component (dropdown)",
    )
    label: Optional[str] = Field(None, description="Label shown to the user")
    default: Optional[Union[str, int, float, bool, date, List[str]]] = None
