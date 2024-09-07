from visivo.models.base.named_model import NamedModel
from visivo.models.base.selector_model import SelectorModel
from .base.base_model import RefString
from .base.parent_model import ParentModel
from pydantic import Field
from typing import List, Optional
from enum import Enum
from .item import Item


class HeightEnum(str, Enum):
    compact = "compact"
    small = "small"
    medium = "medium"
    large = "large"


class Row(NamedModel, ParentModel):
    """
    Rows are the horizontal component of the dashboard grid and house 1 to many Items.
    """

    height: HeightEnum = Field(
        HeightEnum.medium, description="Sets the height of the row."
    )
    items: List[Item] = Field(
        None,
        description="A list of items containing tables, charts or markdown. Items are placed in the row in the order that they are listed from left to right.",
    )

    def child_items(self):
        return self.items
