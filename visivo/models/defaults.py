from typing import List, Optional
from enum import Enum
from .item import Item
import pydantic


class Defaults(pydantic.BaseModel):
    alert_name: Optional[str]
    target_name: Optional[str]
