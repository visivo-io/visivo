from typing import List, Optional
from pydantic import Field
from pathlib import Path
from enum import Enum

from visivo.models.base.base_model import BaseModel


class AggregationEnum(Enum):
    """
    The options for aggregating table columns. Details on the calculations below:<br>

        **count** - Finds the number of rows in a group<br>

        **extent** - Finds the minimum and maximum values of a group of rows<br>

        **max** - Finds the maximum value of a group of rows<br>

        **mean** - Finds the average value of a group of rows<br>

        **median** - Finds the median value of a group of rows<br>

        **min** - Finds the minimum value of a group of rows<br>

        **sum** - sums the values of a group of rows<br>

        **uniqueCount** - Finds the number of unique values of a group of rows<br>

        **unique** - Finds the unique values of a group of rows
    """

    count = "count"
    extent = "extent"
    max = "max"
    mean = "mean"
    median = "median"
    min = "min"
    sum = "sum"
    uniqueCount = "uniqueCount"
    unique = "unique"


class TableColumn(BaseModel):
    header: Optional[str] = Field(
        None,
        description="The display name of the column. Defaults to readable key name.",
    )
    key: str = Field(
        None,
        description="The key to the data that will pull back the value.",
    )
    aggregation: Optional[AggregationEnum] = Field(
        None,
        description="The aggregate function that will apply to the column when a user groups the table by a different column. Defaults to none.",
    )
    markdown: Optional[bool] = Field(
        False,
        description="If true, the column content will be rendered as markdown. Defaults to false.",
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
