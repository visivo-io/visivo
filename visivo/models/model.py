from typing import Optional
from pydantic import Field
from .base.base_model import BaseModel


class Model(BaseModel):
    """
    Models are queries that return base data that is used in Traces
    """

    name: Optional[str] = Field(
        None,
        description="Name of the model",
    )

    sql: str = Field(
        None,
        description="The sql used to generate your base data",
    )
