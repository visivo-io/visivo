from pydantic import Field
from pathlib import Path
import pydantic
import os


class Include(pydantic.BaseModel):
    """
    Include's can be used to break apart a project file with references to other files.
    """

    path: str = Field(
        None,
        description="The path or git reference to external yml files to include in this project",
    )

    @property
    def file(self):
        return Path(self.path)
