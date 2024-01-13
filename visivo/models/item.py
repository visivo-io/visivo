from .base.base_model import BaseModel, REF_REGEX, generate_ref_field
from .base.parent_model import ParentModel
from pydantic import Field
from typing import Optional, Union
from .chart import Chart
from .table import Table
from pydantic import model_validator
import uuid


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
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._id = kwargs["id"] if "id" in kwargs else uuid.uuid4().hex 

    def id(self):
        return f"Item - {self._id}"

    width: int = Field(
        1,
        description="The width of the Item determines is evaluated relative to the other items in a row.",
    )
    markdown: Optional[str] = Field(
        None, description="Markdown text to include in the dashboard."
    )
    chart: Optional[generate_ref_field(Chart)] = Field(
        None, description="A chart object defined inline or a ref() to a chart."
    )
    table: Optional[generate_ref_field(Table)] = Field(
        None, description="A Table object defined inline or a ref() to a table"
    )

    @model_validator(mode="before")
    @classmethod
    def validate_column_refs(cls, data: any):
        markdown, chart, table = (
            data.get("markdown"),
            data.get("chart"),
            data.get("table"),
        )
        items_set = [i for i in [markdown, chart, table] if i is not None]
        if len(items_set) > 1:
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
