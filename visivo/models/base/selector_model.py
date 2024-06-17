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
        if BaseModel.is_obj(self.selector):
            self.selector.set_parent_name(self.name)
        return self

    @model_validator(mode="before")
    @classmethod
    def ensure_selector(cls, data: Any) -> Any:
        selector = data.get("selector")
        if selector is None:
            name = data.get("name")
            data["selector"] = {"name": f"{name} Selector"}
        return data
