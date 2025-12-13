from datetime import date
from enum import Enum
from typing import List, Optional, Union

from pydantic import Field
from visivo.models.base.named_model import NamedModel
from visivo.models.base.parent_model import ParentModel


class InputTypes(str, Enum):
    DROPDOWN = "dropdown"


class Input(NamedModel, ParentModel):
    """Base class for all input types."""

    type: InputTypes = Field(
        default=InputTypes.DROPDOWN,
        description="Type of input component (dropdown)",
    )
    label: Optional[str] = Field(
        default=None,
        description="Label shown to the user",
    )
    default: Optional[Union[str, int, float, bool, date, List[str]]] = None

    def child_items(self):
        """
        Return dependencies for DAG construction.

        Base implementation returns empty list. Subclasses should override
        to return their specific dependencies.
        """
        raise NotImplementedError("Sub class should define it's own child item return")
