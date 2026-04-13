from visivo.models.base.named_model import NamedModel
from visivo.models.inputs.fields import InputField
from visivo.models.base.base_model import generate_ref_field
from visivo.models.base.parent_model import ParentModel
from visivo.models.markdown import Markdown
from pydantic import Field, model_validator
from typing import Optional
from visivo.models.chart import Chart
from visivo.models.table import Table


class Item(NamedModel, ParentModel):
    """
    The Item houses a single chart, table, markdown, or input object.

    It also informs the width that the chart, table or markdown should occupy within a row. Widths are evaluated for each item in a row relative to all of the other items in the row.

    In the example below, the markdown would take up 1/4th of the row and would be positioned on the left edge. The table would also take up 1/4th of the page and would sit to the right of the markdown. The chart would take up 1/2 of the page and would touch the right edge of the row.

    ``` yaml
    items:
      - width: 1
        markdown: ref(welcome-markdown)
      - width: 1
        table: ref(table-name)
      - width: 2
        chart: ref(chart-name)
      - width: 1
        input: ref(input-name)
    ```

    ## Markdown
    Reference a markdown object to add formatted text to your dashboard:

    ``` yaml
    markdowns:
      - name: welcome-markdown
        content: |
          # Welcome to Visivo
          This is **formatted** text.
        align: center
        justify: start

    dashboards:
      - name: my-dashboard
        rows:
          - items:
              - markdown: ref(welcome-markdown)
    ```

    Markdown content supports [CommonMark](https://commonmark.org/help/) and [GitHub Flavored Markdown](https://github.github.com/gfm/). You can also render raw HTML within your markdown.
    """

    width: int = Field(
        1,
        description="The width of the Item determines is evaluated relative to the other items in a row.",
    )
    markdown: Optional[generate_ref_field(Markdown)] = Field(
        None,
        description="A Markdown object defined inline or a ${ ref() } to a markdown.",
    )
    chart: Optional[generate_ref_field(Chart)] = Field(
        None, description="A chart object defined inline or a ${ ref() } to a chart."
    )
    table: Optional[generate_ref_field(Table)] = Field(
        None, description="A Table object defined inline or a ${ ref() } to a table."
    )
    input: Optional[generate_ref_field(InputField)] = Field(
        None, description="An Input object defined inline or a ${ ref() } to an input."
    )

    @model_validator(mode="before")
    @classmethod
    def validate_unique_item_types(cls, data: any):
        markdown, chart, table, input = (
            data.get("markdown"),
            data.get("chart"),
            data.get("table"),
            data.get("input"),
        )
        items_set = [i for i in [markdown, chart, table, input] if i is not None]
        if len(items_set) > 1:
            raise ValueError(
                'only one of the "markdown", "chart", "table", or "input" properties should be set on an item'
            )
        return data

    def child_items(self):
        child = self.__get_child()
        if child:
            return [self.__get_child()]
        return []

    def __get_child(self):
        if self.table is not None:
            return self.table
        if self.chart is not None:
            return self.chart
        if self.input is not None:
            return self.input
        if self.markdown is not None and isinstance(self.markdown, Markdown):
            return self.markdown
