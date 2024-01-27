from typing import Optional
from pydantic import Field
from visivo.models.target import Target
from .base.base_model import BaseModel, generate_ref_field


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

    target: Optional[generate_ref_field(Target)] = Field(
        None,
        description="A target object defined inline or a ref() to a chart. Override the defaults.target_name",
    )
