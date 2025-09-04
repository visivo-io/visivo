import re
from typing import List, Literal, Optional, Union
from pydantic import Field
from visivo.models.inputs.base import Input
from visivo.models.fields import QueryOrStringField


class DropdownInput(Input):
    type: Literal["dropdown"] = "dropdown"
    options: Optional[Union[List[str], QueryOrStringField, str]] = Field(
        None, description="Static list of options OR a dynamic SQL string '${ref(insight)}'"
    )
    multi: bool = Field(False, description="Allow multi-select")
