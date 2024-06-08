from typing import Optional
from pydantic import Field
from pathlib import Path

from visivo.models.base.base_model import BaseModel
from pydantic import model_validator


class Selector(BaseModel):
    """
    Selectors allow you to specify which data are selected on an item.
    """

    name: Optional[str] = Field(
        None,
        description="The name of the selector",
    )
