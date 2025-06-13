from visivo.models.base.named_model import NamedModel
from visivo.models.base.named_model import NamedModel
from visivo.models.base.parent_model import ParentModel
from pydantic import Field
from typing import List
from enum import Enum
from visivo.models.item import Item


class HeightEnum(str, Enum):
    compact = "compact"
    xsmall = "xsmall"
    small = "small"
    medium = "medium"
    large = "large"
    xlarge = "xlarge"
    xxlarge = "xxlarge"


class Row(NamedModel, ParentModel):
    """
    Rows are the horizontal component of the dashboard grid and house 1 to many [Items](./Item/).

    !!! tip
        You can set the height of a row using the `height` attribute on a row

        ??? information "Row Height Options in Pixels"

            | Height | Pixels |
            |------------|-------|
            | compact | wrapped |
            | xsmall | 128 |
            | small | 256 |
            | medium | 396 |
            | large | 512 |
            | xlarge | 768 |
            | xxlarge | 1024 |
    """

    height: HeightEnum = Field(HeightEnum.medium, description="Sets the height of the row.")
    items: List[Item] = Field(
        None,
        description="A list of items containing tables, charts or markdown. Items are placed in the row in the order that they are listed from left to right.",
    )

    def child_items(self):
        return self.items
