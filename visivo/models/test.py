from .base_model import BaseModel
from enum import Enum
from typing import Optional


class TypeEnum(str, Enum):
    """Enums corrisponde to testing template names"""

    coordinate_exists = "coordinate_exists"
    not_null = "not_null"


class Test(BaseModel):
    type: TypeEnum
    kwargs: Optional[dict]

    __test__ = False
