from typing import List
from pydantic import Field
from pathlib import Path

from visivo.models.base.base_model import BaseModel


class TableColumn(BaseModel):
    header: str = Field(
        None,
        description="The name of the trace or cohort that the column defs apply to.",
    )
    key: str = Field(
        None,
        description="The key to the data that will pull back the value.",
    )


class TableColumns(BaseModel):
    """
    Include's can be used to break apart a project file with references to other files. This includes files from remote github repositories.

    [Read more about includes here ](including.md)
    """

    data_name: str = Field(
        None,
        description="The name of the trace or cohort that the column defs apply to.",
    )
    columns_def: List[TableColumn] = Field(
        description="A list of dictionaries that contain the keys `header` and `column`. `header` is the title of the column in the table. `column` is the column name from the trace that you want to include in the table.",
    )

    @property
    def file(self):
        return Path(self.path)
