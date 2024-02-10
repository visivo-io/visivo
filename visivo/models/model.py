from typing import Any, Optional, Union
from typing_extensions import Annotated
from pydantic import Field, Discriminator, Tag
from visivo.models.base.named_model import NamedModel
from visivo.models.base.parent_model import ParentModel
from visivo.models.target import DefaultTarget, Target
from .base.base_model import RefString, generate_ref_field


class Model(NamedModel):
    pass


class RunModel(Model):
    run: str = Field(description="The sql used to generate your base data")


class SqlModel(Model, ParentModel):
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


def get_model_discriminator_value(value: Any) -> str:
    if isinstance(value, str):
        return "Ref"
    if isinstance(value, dict):
        if "sql" in value:
            return "Sql"
        if "run" in value:
            return "Run"
    if hasattr(value, "sql"):
        return "Sql"
    if hasattr(value, "run"):
        return "Run"

    return None


ModelField = Annotated[
    Union[
        Annotated[SqlModel, Tag("Sql")],
        Annotated[RunModel, Tag("Run")],
    ],
    Discriminator(get_model_discriminator_value),
]

ModelRefField = Annotated[
    Union[
        RefString,
        Annotated[SqlModel, Tag("Sql")],
        Annotated[RunModel, Tag("Run")],
    ],
    Discriminator(get_model_discriminator_value),
]
