from enum import Enum
from typing import Optional

from pydantic import Field
from visivo.models.base.named_model import NamedModel
from visivo.models.base.parent_model import ParentModel


class InputTypes(str, Enum):
    SINGLE_SELECT = "single-select"
    MULTI_SELECT = "multi-select"


class Input(NamedModel, ParentModel):
    """Base class for all input types."""

    type: InputTypes = Field(
        description="Type of input component (single-select or multi-select)",
    )
    label: Optional[str] = Field(
        default=None,
        description="Label shown to the user",
    )

    def child_items(self):
        """
        Return dependencies for DAG construction.

        Base implementation returns empty list. Subclasses should override
        to return their specific dependencies.
        """
        raise NotImplementedError("Sub class should define it's own child item return")
