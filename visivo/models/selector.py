from enum import Enum
from typing import List
from pydantic import ConfigDict, Field, PrivateAttr, model_serializer

from visivo.models.base.base_model import BaseModel, RefString, generate_ref_field
from visivo.models.base.named_model import NamedModel
from visivo.models.base.parent_model import ParentModel


class SelectorType(str, Enum):
    single = "single"
    multiple = "multiple"


class Selector(ParentModel, NamedModel, BaseModel):
    """
    Selectors can be used to add interactivity between charts and tables.

    Below is how you would link two charts to show the same selected data.

    ### Example

    ``` yaml
    charts:
        - name: Chart One
          selector:
              name: Common Selector
              type: single
              ...
        - name: Chart Two
          selector: ref(Common Selector)
          ...
    ```

    """

    model_config = ConfigDict(extra="ignore")

    name: str = Field(description="The name of the selector")
    type: SelectorType = Field(
        SelectorType.multiple, description="Single or multiple selector"
    )
    options: List[RefString] = Field(
        [], description="Optional to set the traces to create the choices list"
    )

    _parent_name: str = PrivateAttr()

    def set_parent_name(self, value: str):
        self._parent_name = value

    @model_serializer()
    def serialize_model(self):
        model = {"name": self.name, "type": self.type, "options": self.options}
        if hasattr(self, "_parent_name"):
            model["parent_name"] = self._parent_name
        else:
            model["parent_name"] = self.name
        return model

    def child_items(self):
        return self.options
