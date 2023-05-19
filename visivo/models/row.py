from .base_model import BaseModel
from pydantic import Field
from typing import List
from enum import Enum
from .item import Item


class HeightEnum(str, Enum):
    small = "small"
    medium = "medium"
    large = "large"


class Row(BaseModel):
    """
    Rows are the horizontal component of the dashboard grid and house 1 to many Items. 
    """
    height: HeightEnum = Field(HeightEnum.medium, description="Sets the height of the row.")
    items: List[Item] = Field(None, description="A list of items containing tables, charts or markdown. Items are placed in the row in the order that they are listed from left to right.")
