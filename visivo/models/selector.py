from typing import Any, Optional
from pydantic import Field
from pathlib import Path

from visivo.models.base.base_model import BaseModel
from pydantic import model_validator


class Selector(BaseModel):
    """
    Selectors allow you to specify which data are selected on an item.
    """

    name: str = Field(description="The name of the selector")
