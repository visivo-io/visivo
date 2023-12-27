from .base.base_model import BaseModel, REF_REGEX
from .base.parent_model import ParentModel
from pydantic import StringConstraints, Field
from typing import Optional, Union
from .chart import Chart
from .table import Table
from pydantic import model_validator
from typing_extensions import Annotated


class Item(BaseModel, ParentModel):
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

    def id(self):
        child = self.__get_child()
        if isinstance(child, str):
            return f"Item - {hash(child)}"
        if isinstance(self.chart, Chart) or isinstance(self.table, Table):
            return f"Item - {child.id()}"

    width: int = Field(
        1,
        description="The width of the Item determines is evaluated relative to the other items in a row.",
    )
    markdown: Optional[str] = Field(
        None, description="Markdown text to include in the dashboard."
    )
    chart: Optional[
        Union[Annotated[str, StringConstraints(pattern=REF_REGEX)], Chart]
    ] = Field(None, description="A chart object defined inline or a ref() to a chart.")

    table: Optional[
        Union[Annotated[str, StringConstraints(pattern=REF_REGEX)], Table]
    ] = Field(None, description="A Table object defined inline or a ref() to a table")

    @model_validator(mode="before")
    @classmethod
    def validate_column_refs(cls, data: any):
        markdown, chart, table = (
            data.get("markdown"),
            data.get("chart"),
            data.get("table"),
        )
        if markdown is not None and chart is not None and table is not None:
            raise ValueError(
                'only one of the "markdown", "chart", or "table" properties should be set on an item'
            )
        return data

    def child_items(self):
        return [self.__get_child()]

    def __get_child(self):
        if self.markdown is not None:
            return self.markdown
        if self.table is not None:
            return self.table
        if self.chart is not None:
            return self.chart
