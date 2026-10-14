from visivo.models.base.named_model import NamedModel
from visivo.models.base.parent_model import ParentModel
from pydantic import Field, field_validator
from typing import List, Union
from enum import Enum
from visivo.models.item import Item


class HeightEnum(str, Enum):
    """
    Named row heights, from `compact` (wraps to content) through `xxlarge` (1024px).

    Each value maps to a fixed pixel height: `xsmall` 128, `small` 256, `medium` 396,
    `large` 512, `xlarge` 768, `xxlarge` 1024. A `compact` row wraps markdown and
    inputs to their content and gives a chart or table a 256px plot area. A [Row](../)'s
    `height` also accepts a positive integer to set an exact pixel height instead.
    """

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
        You can set the height of a row using the `height` attribute on a row. The field
        accepts either a named enum value or a positive integer pixel value — the canvas's
        fluid-resize gesture writes pixel values directly.

        ??? information "Row Height Options in Pixels"

            | Height | Pixels |
            |------------|-------|
            | compact | wraps to content; charts and tables get a 256px plot |
            | xsmall | 128 |
            | small | 256 |
            | medium | 396 |
            | large | 512 |
            | xlarge | 768 |
            | xxlarge | 1024 |
            | `<int>` | the integer itself, in pixels |

        When the dashboard is narrower than its stacking breakpoint, the items of a
        row stack vertically and each item receives the row height in proportion to
        its `width` share (never less than 160px), so a row of four small KPIs stacks
        to four 160px tiles rather than four 256px ones.
    """

    height: Union[HeightEnum, int] = Field(
        HeightEnum.medium,
        description=(
            "Sets the height of the row. Accepts either an enum token "
            "(compact | xsmall | small | medium | large | xlarge | xxlarge) "
            "or a positive integer pixel value. The canvas's Shift-modifier "
            "fluid-resize gesture writes integer pixel values."
        ),
    )
    items: List[Item] = Field(
        None,
        description="A list of items containing tables, charts or markdown. Items are placed in the row in the order that they are listed from left to right.",
    )

    @field_validator("height")
    @classmethod
    def validate_height(cls, value):
        if isinstance(value, int) and not isinstance(value, bool) and value <= 0:
            raise ValueError("height must be a positive integer when given as a pixel value")
        return value

    def child_items(self):
        return self.items


# Resolve the forward reference Item.rows: Optional[List["Row"]] now that Row is defined.
# Pydantic v2 needs an explicit rebuild because Item is imported above (when Row didn't exist
# yet) and Item.rows references "Row" by string. Calling model_rebuild here updates Item's
# schema to bind the string reference to the actual Row class.
Item.model_rebuild()
