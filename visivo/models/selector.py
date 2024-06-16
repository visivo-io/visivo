from enum import Enum
from pydantic import Field, PrivateAttr

from visivo.models.base.base_model import BaseModel
from visivo.models.base.named_model import NamedModel


class SelectorType(str, Enum):
    single = "single"
    multiple = "multiple"


class Selector(NamedModel, BaseModel):
    """
    Selectors allow you to specify which data are selected on an item.
    """

    name: str = Field(description="The name of the selector")
    type: SelectorType = Field(
        SelectorType.multiple, description="Single or multiple selector"
    )
    _parent_name: str = PrivateAttr()

    def set_parent_name(self, value: str):
        self._parent_name = value

    def model_dump(self, **kwargs):
        data = super().model_dump(**kwargs)
        data["parent_name"] = self._parent_name
        return data
