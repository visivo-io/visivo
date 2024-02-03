from typing import Optional
from pydantic import Field, validator
from visivo.models.base.named_model import NamedModel
from visivo.models.base.parent_model import ParentModel
from visivo.models.target import DefaultTarget, Target
from .base.base_model import generate_ref_field


class Model(NamedModel, ParentModel):
    """
    Models are queries that return base data that is used in Traces
    """

    sql: str = Field(
        None,
        description="The sql used to generate your base data",
    )

    target: Optional[generate_ref_field(Target)] = Field(
        None,
        description="A target object defined inline or a ref() to a chart. Override the defaults.target_name",
    )

    def child_items(self):
        if self.target:
            return [self.target]
        else:
            return [DefaultTarget()]
