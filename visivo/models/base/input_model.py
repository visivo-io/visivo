from typing import Any, Optional

from visivo.models.input import InputField
from visivo.models.base.base_model import BaseModel, generate_ref_field
from pydantic import model_validator, Field


class InputModel(BaseModel):
    input: Optional[generate_ref_field(InputField)] = Field(
        None, description="The input for the choosing which insight data is shown."
    )

    @model_validator(mode="after")
    def set_parent_name(self):
        if self.input and BaseModel.is_obj(self.input):
            self.input.set_parent_name(self.name)
            if len(self.input.options) > 0:
                raise ValueError(
                    f"Input '{self.input.name}' can not have options set, they are set from the parent item."
                )
        return self
