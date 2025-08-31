from datetime import date
from typing import List, Literal, Optional, Union

from pydantic import Field, constr

from visivo.models.input import InputBase


class DropdownInput(InputBase):
    type: Literal["dropdown"]
    options: Optional[Union[List[str], str]] = Field(
        None,
        description="Static list of options OR a dynamic SQL query (string with ${ref(...)})"
    )
    multi: bool = Field(False, description="Allow multi-select")

class TabsInput(InputBase):
    type: Literal["tabs"]
    options: List[str]

class TextInput(InputBase):
    type: Literal["text"]
    regex: Optional[constr(regex=r".*")] = Field(
        None, description="Optional regex validation"
    )

class SliderInput(InputBase):
    type: Literal["slider"]
    min: float
    max: float
    step: Optional[float] = 1.0

class ToggleInput(InputBase):
    type: Literal["toggle"]
    default: Optional[bool] = False

class DateInput(InputBase):
    type: Literal["date"]
    min: Optional[date] = None
    max: Optional[date] = None
