from pydantic import BaseModel
from typing import List, Optional, Dict


class TokenizedTrace(BaseModel):
    base_sql: str
    cohort_on: str
    groupby_statements: Optional[List[str]]
    select_items: Optional[Dict]
    filter_by: Optional[Dict[str, List[Optional[str]]]]
    order_by: Optional[List[str]]
