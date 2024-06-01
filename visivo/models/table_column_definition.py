from typing import List, Optional
from pydantic import Field
from pathlib import Path

from visivo.models.base.base_model import BaseModel


class TableColumn(BaseModel):
    header: Optional[str] = Field(
        None,
        description="The display name of the column.  Defaults to readable key name.",
    )
    key: str = Field(
        None,
        description="The key to the data that will pull back the value.",
    )


class TableColumnDefinition(BaseModel):
    """
    Table columns allow you to display a subset of the available trace data.
    """

    trace_name: str = Field(
        None,
        description="The name of the trace that the column defs apply to.",
    )
    columns: List[TableColumn] = Field(
        description="A list of column definitions that contain `header` and `key`. `header` is the title of the column in the table. `key` is the path to the array property you want to include.  For example 'props.x' or 'columns.x_data'.",
    )

    @property
    def file(self):
        return Path(self.path)
