from datetime import date
from enum import Enum
from typing import Annotated, List, Optional, Union

from pydantic import ConfigDict, Field

from visivo.models.base.base_model import BaseModel
from visivo.models.base.named_model import NamedModel
from visivo.models.base.parent_model import ParentModel
from visivo.models.inputs.input_types import (
    DateInput,
    DropdownInput,
    SliderInput,
    TabsInput,
    TextInput,
    ToggleInput,
)


class InputTypes(str, Enum):
    date = "date"
    dropdown = "dropdown"
    text = "text"
    slider = "slider"
    toggle = "toggle"
    tabs = "tabs"


class InputBase(ParentModel, NamedModel):
    model_config = ConfigDict(extra="ignore")
    type: InputTypes = Field(
        InputTypes.dropdown,
        description="Type of input component (dropdown, date, text, slider, etc.)",
    )
    label: Optional[str] = Field(None, description="Label shown to the user")
    default: Optional[Union[str, int, float, bool, date, List[str]]] = None


Input = Annotated[
    Union[DropdownInput, TabsInput, TextInput, SliderInput, ToggleInput, DateInput],
    Field(discriminator="type"),
]

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

Example usage
inputs:
    - name: date-range
    type: date
    label: "Select Date Range"
    min: 2020-01-01
    default: 2024-01-01

    - name: sales-region
    type: dropdown
    label: "Region"
    options:
        - North
        - South
        - East
        - West
    default: "North"

    - name: product-categories
    type: dropdown
    label: "Product Category"
    options: ${ select distinct(category) from ${ref(products_insight)} }

"""
