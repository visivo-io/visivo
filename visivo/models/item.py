from visivo.models.base.named_model import NamedModel
from visivo.models.selector import Selector
from .base.base_model import generate_ref_field
from .base.parent_model import ParentModel
from pydantic import Field
from typing import Optional
from .chart import Chart
from .table import Table
from pydantic import model_validator


class Item(NamedModel, ParentModel):
    """
    The Item houses a single chart, table, selector or markdown object. 
    
    It also informs the width that the chart, table or markdown should occupy within a row. Widths are evaluated for each item in a row relative to all of the other items in the row.

    In the example below, the markdown would take up 1/4th of the row and would be positioned on the left edge. The table would also take up 1/4th of the page and would sit to the right of the markdown. The chart would take up 1/2 of the page and would touch the right edge of the row.

    ``` yaml
    items:
      - width: 1
        markdown: "# Some inline **markdown**"
      - width: 1
        table: ref(table-name)
      - width: 2
        chart: ref(chart-name)
      - width: 1
        selector: ref(selector-name)
    ```
    """

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
    selector: Optional[generate_ref_field(Selector)] = Field(
        None, description="A Selector object defined inline or a ref() to a selector"
    )

    @model_validator(mode="before")
    @classmethod
    def validate_unique_item_types(cls, data: any):
        markdown, chart, table, selector = (
            data.get("markdown"),
            data.get("chart"),
            data.get("table"),
            data.get("selector"),
        )
        items_set = [i for i in [markdown, chart, table, selector] if i is not None]
        if len(items_set) > 1:
            raise ValueError(
                'only one of the "markdown", "chart", "table", or "selector" properties should be set on an item'
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
        if self.selector is not None:
            return self.selector
