import re
from typing import List, Literal, Optional, Union
from pydantic import Field
from visivo.models.fields import QueryOrStringField
from visivo.models.inputs.base import InputBasemodel


class DropdownInput(InputBasemodel):
    type: Literal["dropdown"] = "dropdown"
    options: Optional[Union[List[str], QueryOrStringField, str]] = Field(
        None, description="Static list of options OR a dynamic SQL string '${ref(insight)}'"
    )
    multi: bool = Field(False, description="Allow multi-select")

    def child_items(self):
        return []
