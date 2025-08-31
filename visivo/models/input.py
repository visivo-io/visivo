from datetime import date
from enum import Enum
from typing import List, Optional, Union

from pydantic import ConfigDict, Field

from visivo.models.base.base_model import BaseModel
from visivo.models.base.named_model import NamedModel
from visivo.models.base.parent_model import ParentModel
from visivo.models.inputs.input_types import DateInput, DropdownInput, SliderInput, TabsInput, TextInput, ToggleInput


class InputTypes(str, Enum):
    date = 'date'
    date_range = 'date-range'
    dropdown = 'dropdown'
    text = 'text'
    slider = 'slider'


class InputBase(ParentModel, NamedModel):
    model_config = ConfigDict(extra="ignore")

    type: InputTypes = Field(InputTypes.dropdown, description="Type of input component (dropdown, date, text, slider, etc.)")
    label: Optional[str] = Field(None, description="Label shown to the user")
    default: Optional[Union[str, int, float, bool, date, List[str]]] = None


InputConfig = Union[
    DropdownInput,
    TabsInput,
    TextInput,
    SliderInput,
    ToggleInput,
    DateInput
]

class Input(BaseModel):
    """
    Inputs serve as generic value injectors that other components can react to,
    rather than pushing changes themselves.

    Input Types:
        - dropdown: Single or multi-select options
        - tabs: Mutually exclusive selection
        - text: Freeform input with optional regex validation
        - slider: Numeric range selection
        - toggle: Boolean true/false
        - date: Date/time selection
    """
    inputs: List[InputConfig]

