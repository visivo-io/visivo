from enum import Enum
import re
from typing import Any, List, NewType, Union
from typing_extensions import Annotated
from pydantic import ConfigDict, Discriminator, Field, PrivateAttr, model_serializer

from visivo.models.base.base_model import BaseModel, ContextStringType, RefStringType
from visivo.models.base.context_string import CONTEXT_STRING_VALUE_REGEX, ContextString
from visivo.models.base.named_model import NamedModel
from visivo.models.base.parent_model import ParentModel


class SelectorType(str, Enum):
    single = "single"
    multiple = "multiple"


def get_discriminator_value(value: Any) -> str:
    if isinstance(value, str) and re.search(CONTEXT_STRING_VALUE_REGEX, value):
        return "Context"
    elif isinstance(value, str):
        return "Ref"
    else:
        return None


class Selector(ParentModel, NamedModel, BaseModel):
    """
    Selectors enable you to toggle between multiple different traces in your chart.

    !!! tip
        Selectors can also be used to add interactivity between charts different tables. You can read more about using [selectors to add interactivity here](../../../topics/interactivity).

    You can configure selectors to be single select or multi-select. Single select is great if you only want to show a single trace at a time on the chart while the multi-select can be really useful for providing filtering capabilities.

    ### Example
    Here's how you might use selectors to create interactivity between two different charts.
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

    type: SelectorType = Field(SelectorType.multiple, description="Single or multiple selector")
    options: List[
        Annotated[
            Union[
                RefStringType,
                ContextStringType,
            ],
            Discriminator(get_discriminator_value),
        ]
    ] = Field(
        [],
        description="Optional set of traces, items, or rows to create the choices list",
    )

    _parent_name: str = PrivateAttr()

    def set_parent_name(self, value: str):
        self._parent_name = value

    @model_serializer()
    def serialize_model(self):
        model = {"name": self.name, "type": self.type, "options": []}
        for option in self.options:
            if isinstance(option, str):
                model["options"].append(option)
            elif isinstance(option, ContextString):
                model["options"].append(option.value)
            else:
                model["options"].append(
                    {"name": option.name, "type": option.__class__.__name__.lower()}
                )
        if hasattr(self, "_parent_name"):
            model["parent_name"] = self._parent_name
        else:
            model["parent_name"] = self.name
        return model

    def child_items(self):
        return self.options
