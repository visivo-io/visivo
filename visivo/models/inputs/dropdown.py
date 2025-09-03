from typing import List, Literal, Optional, Union

from pydantic import Field

from visivo.models.inputs.base import Input


class DropdownInput(Input):
    type: Literal["dropdown"] = "dropdown"
    options: Optional[Union[List[str], str]] = Field(
        None, description="Static list of options OR a dynamic SQL query (string with ${ref(...)})"
    )
    multi: bool = Field(False, description="Allow multi-select")
