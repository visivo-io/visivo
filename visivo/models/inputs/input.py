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

    # The label is what the widget is called on screen; no query reads it. It
    # used to rebuild the input's options and everything downstream, so
    # renaming "Cuisine" to "Pick a cuisine" ran the project.
    #
    # ``file_path`` is where the object was authored, not an input to anything
    # a job runs — moving it between files should not rebuild it.
    presentation_fields = frozenset({"label", "file_path"})

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
