from typing import List, Optional, Union, Literal
from pydantic import Field
from visivo.models.base.named_model import NamedModel


class BaseDashboard(NamedModel):
    """Base class for all dashboard types (internal and external)"""

    level: Optional[Union[int, str]] = Field(
        None,
        description="The importance level of the dashboard (either an index number or level title)",
    )
    tags: List[str] = Field(
        default_factory=list, description="A list of tags associated with the dashboard"
    )
    description: Optional[str] = Field(
        None, description="A description of the dashboard's purpose and contents"
    )
    type: Literal["internal", "external"] = Field(
        ..., description="The type of dashboard (internal or external)"
    )
    name: str = Field(..., description="The unique name of the dashboard across the entire project")

    def for_each_item(self, function):
        pass
