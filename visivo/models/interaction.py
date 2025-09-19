from typing import Optional
from pydantic import BaseModel, Field

from visivo.models.fields import QueryOrStringField


class InsightInteraction(BaseModel):
    """
    Represents a client-side interaction that can be applied to insight data.
    """

    filter: Optional[QueryOrStringField] = Field(
        None, description="Filter expression to apply to the data on the client side"
    )
    split: Optional[QueryOrStringField] = Field(
        None, description="Column or expression to split data into multiple traces"
    )
    sort: Optional[QueryOrStringField] = Field(
        None, description="Column or expression to sort data by"
    )
