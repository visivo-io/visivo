from pydantic import Field
from pathlib import Path
from typing import List, Optional

from visivo.models.base.base_model import BaseModel


class Include(BaseModel):
    """
    Includes break a project apart into multiple files by pulling other YAML files —
    or whole directories — into the root project file.

    !!! example

        ``` yaml
        includes:
          - path: models/orders.yml
          - path: dashboards/
            depth: 1
            exclusions:
              - drafts/*
        ```

    [Read more about includes here](../../../topics/including.md)
    """

    path: str = Field(
        None,
        description="Path to a yml file or directory to include in this project, relative to the file that declares it",
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
