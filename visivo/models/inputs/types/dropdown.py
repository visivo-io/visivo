import re
from typing import List, Literal, Optional, Union
from pydantic import Field
from visivo.models.base.context_string import ContextString
from visivo.models.base.query_string import QueryString
from visivo.models.fields import QueryOrStringField
from visivo.models.inputs.input import Input


class DropdownInput(Input):
    type: Literal["dropdown"] = "dropdown"
    options: Optional[Union[List[str], QueryOrStringField, str]] = Field(
        None, description="Static list of options OR a dynamic SQL string '${ref(insight)}'"
    )
    multi: bool = Field(False, description="Allow multi-select")

    def child_items(
        self,
    ):  # TODO: Tim & Jared to discuss if this is how we want to handle inputs based on query results and how this impacts the dag runner. Not sure if this is accounted for now
        if isinstance(self.options, QueryString):
            if ContextString.is_context_string(self.options):
                return [self.options]
        return []
