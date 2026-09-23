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

    # The label is what the widget is called on screen; the input job reads
    # options, display and range, never this. Renaming "Cuisine" to "Pick a
    # cuisine" used to rebuild the options and everything downstream.
    presentation_fields = frozenset({"label"})

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
