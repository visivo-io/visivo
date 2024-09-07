from typing import Any, Optional

from visivo.models.selector import Selector
from visivo.models.base.base_model import BaseModel, generate_ref_field
from pydantic import model_validator, Field


class SelectorModel(BaseModel):
    selector: Optional[generate_ref_field(Selector)] = Field(
        None, description="The selector for the choosing which trace data is shown."
    )

    @model_validator(mode="after")
    def set_parent_name(self):
        if self.selector and BaseModel.is_obj(self.selector):
            self.selector.set_parent_name(self.name)
            if len(self.selector.options) > 0:
                raise ValueError(
                    f"Selector '{self.selector.name}' can not have options set, they are set from the parent item."
                )
        return self
