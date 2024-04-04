from typing import Annotated
from visivo.models.base.named_model import NamedModel
from pydantic import Field


class Model(NamedModel):
    pass


TableModelName = Annotated[str, Field(pattern="[a-zA-Z0-9_]")]
