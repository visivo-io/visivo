from .base.named_model import NamedModel
from enum import Enum
from typing import Optional


class TypeEnum(str, Enum):
    """Enums corresponded to testing template names"""

    coordinate_exists = "coordinate_exists"
    not_null = "not_null"


class Test(NamedModel):
    type: TypeEnum
    kwargs: Optional[dict]

    __test__ = False
