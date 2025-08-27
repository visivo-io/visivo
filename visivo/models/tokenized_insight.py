from enum import Enum
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any


class InteractionType(str, Enum):
    FILTER = "filter"
    SPLIT = "split"
    SORT = "sort"


class Interaction(BaseModel):
    type: InteractionType
    expression: str


class TokenizedInsight(BaseModel):
    name: str
    pre_query: str
    post_query: str
    interactions: List[Interaction] = Field(default_factory=list)
    source: str
    source_type: Optional[str] = None
