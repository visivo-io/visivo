from enum import Enum
from pydantic import ConfigDict, Field, PrivateAttr, model_serializer

from visivo.models.base.base_model import BaseModel
from visivo.models.base.named_model import NamedModel


class SelectorType(str, Enum):
    single = "single"
    multiple = "multiple"


class Selector(NamedModel, BaseModel):
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
    model_config = ConfigDict(extra='ignore')  

    name: str = Field(description="The name of the selector")
    type: SelectorType = Field(
        SelectorType.multiple, description="Single or multiple selector"
    )
    _parent_name: str = PrivateAttr()

    def set_parent_name(self, value: str):
        self._parent_name = value

    @model_serializer()
    def serialize_model(self):
        return {"name": self.name, "type": self.type, "parent_name": self._parent_name}
