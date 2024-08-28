from pydantic import BaseModel
from typing import List, Optional, Dict


class TokenizedTrace(BaseModel):
    sql: str
    cohort_on: str
    source: str
    groupby_statements: Optional[List[str]] = None
    select_items: Optional[Dict] = None
    filter_by: Optional[Dict[str, List[Optional[str]]]] = None
    order_by: Optional[List[str]] = None
