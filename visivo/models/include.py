from pydantic import Field
from pathlib import Path
from typing import List, Optional

from visivo.models.base.base_model import BaseModel


class Include(BaseModel):
    """
    Include's can be used to break apart a project file with references to other files. This includes files from remote github repositories.

    [Read more about includes here ](including.md)
    """

    path: str = Field(
        None,
        description="The path or git reference to external yml files or directories to include in this project",
    )

    depth: Optional[int] = Field(
        None,
        description="Directory traversal depth. None=fully recursive, 0=current directory only, 1=one level deep, etc. Only applies to directory paths.",
    )

    exclusions: List[str] = Field(
        default=[],
        description="Patterns to exclude from directory inclusion. Supports glob patterns and regex. Only applies to directory paths.",
    )

    @property
    def file(self):
        return Path(self.path)
