from datetime import date
from typing import List, Literal, Optional, Union

from pydantic import Field, constr

from visivo.models.input import InputBase


class DropdownInput(InputBase):
    type: Literal["dropdown"] = "dropdown"
    options: Optional[Union[List[str], str]] = Field(
        None, description="Static list of options OR a dynamic SQL query (string with ${ref(...)})"
    )
    multi: bool = Field(False, description="Allow multi-select")


class TabsInput(InputBase):
    type: Literal["tabs"] = "tabs"
    options: List[str] = Field(description="List of tab options")


class TextInput(InputBase):
    type: Literal["text"] = "text"
    regex: Optional[constr(regex=r".*")] = Field(None, description="Optional regex validation")


class SliderInput(InputBase):
    type: Literal["slider"] = "slider"
    min: float = Field(description="Minimum value")
    max: float = Field(description="Maximum value")
    step: Optional[float] = Field(1.0, description="Step increment")


class ToggleInput(InputBase):
    type: Literal["toggle"] = "toggle"
    default: Optional[bool] = Field(False, description="Default toggle state")


class DateInput(InputBase):
    type: Literal["date"] = "date"
    min: Optional[date] = Field(None, description="Minimum selectable date")
    max: Optional[date] = Field(None, description="Maximum selectable date")
