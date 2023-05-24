from .base_model import BaseModel, REF_REGEX
from pydantic import Field
from typing import Optional, Union
from .chart import Chart
from .table import Table
from pydantic import root_validator, constr


class Item(BaseModel):
    """
    The Item houses one chart, table or markdown object. It also informs the width that the chart, table or markdown should occupy within a row. Widths are evaluated for each item in the row by summing all of the widths and then using the relative weights.

    In the example below, the markdown would take up 1/4th of the row and would be positioned on the left edge. The table would also take up 1/4th of the page and would sit to the right of the markdown. The chart would take up 1/2 of the page and would touch the right edge of the row.

    ``` yaml
    items:
      - width: 1
        markdown: "# Some inline **markdown**"
      - width: 1
        table: ref(table-name)
      - width: 2
        chart: ref(chart-name)
    ```
    """

    width: int = Field(
        1,
        description="The width of the Item determines is evaluated relative to the other items in a row.",
    )
    markdown: Optional[str] = Field(
        None, description="Markdown text to include in the dashboard."
    )
    chart: Optional[Union[constr(regex=REF_REGEX), Chart]] = Field(
        None, description="A chart object defined inline or a ref() to a chart."
    )
    table: Optional[Union[constr(regex=REF_REGEX), Table]] = Field(
        None, description="A Table object defined inline or a ref() to a table"
    )

    @root_validator
    def check_only_one(cls, values):
        markdown, chart, table = (
            values.get("markdown"),
            values.get("chart"),
            values.get("table"),
        )
        if markdown is not None and chart is not None:
            raise ValueError(
                'only one of the "markdown", "chart", or "table" properties should be set on an item'
            )
        return values
