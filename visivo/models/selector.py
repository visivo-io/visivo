from pydantic import Field

from visivo.models.base.base_model import BaseModel
from visivo.models.base.named_model import NamedModel


class Selector(NamedModel, BaseModel):
    """
    Selectors allow you to specify which data are selected on an item.
    """

    name: str = Field(description="The name of the selector")
