from .base_model import BaseModel
from typing import List, Union
from enum import Enum
from .item import Item


class HeightEnum(str, Enum):
    small = "small"
    medium = "medium"
    large = "large"


class Row(BaseModel):
    height: HeightEnum = HeightEnum.medium
    items: List[Item]
