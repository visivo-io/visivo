from visivo.models.base.named_model import NamedModel
from visivo.models.inputs.fields import InputField
from visivo.models.selector import Selector
from visivo.models.base.base_model import generate_ref_field
from visivo.models.base.parent_model import ParentModel
from visivo.models.markdown import Markdown
from pydantic import Field, model_validator
from typing import Optional, Literal, Union
from visivo.models.chart import Chart
from visivo.models.table import Table


class Item(NamedModel, ParentModel):
    """
    The Item houses a single chart, table, selector, markdown, or input object.

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
        selector: ref(selector-name)
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
    markdown: Optional[Union[generate_ref_field(Markdown), str]] = Field(
        None,
        description="A Markdown object defined inline, a ref() to a markdown, or a markdown string (deprecated).",
    )
    align: Optional[Literal["left", "center", "right"]] = Field(
        None,
        description="DEPRECATED: Use the align property on the Markdown model instead. Alignment of markdown content. Only valid when markdown is set. Options are 'left', 'center', or 'right'.",
    )
    justify: Optional[Literal["start", "end", "center", "between", "around", "evenly"]] = Field(
        None,
        description="DEPRECATED: Use the justify property on the Markdown model instead. Justification of markdown content within its container. Options are 'start', 'end', 'center', 'between', 'around', or 'evenly'.",
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
    input: Optional[generate_ref_field(InputField)] = Field(
        None, description="An Input object defined inline or a ref() to a input"
    )

    @model_validator(mode="before")
    @classmethod
    def validate_unique_item_types(cls, data: any):
        markdown, chart, table, selector, input = (
            data.get("markdown"),
            data.get("chart"),
            data.get("table"),
            data.get("selector"),
            data.get("input"),
        )
        items_set = [i for i in [markdown, chart, table, selector, input] if i is not None]
        if len(items_set) > 1:
            raise ValueError(
                'only one of the "markdown", "chart", "table", "selector", or "input" properties should be set on an item'
            )
        return data

    @model_validator(mode="before")
    @classmethod
    def validate_align_with_markdown(cls, data: any):
        align = data.get("align")
        markdown = data.get("markdown")
        # Only allow align if markdown is present
        if align is not None and markdown is None:
            raise ValueError(
                "The 'align' property can only be set when 'markdown' is present in the same item"
            )
        return data

    @model_validator(mode="before")
    @classmethod
    def validate_justify_with_markdown(cls, data: any):
        justify = data.get("justify")
        markdown = data.get("markdown")
        # Only allow justify if markdown is present
        if justify is not None and markdown is None:
            raise ValueError(
                "The 'justify' property can only be set when 'markdown' is present in the same item"
            )
        return data

    @model_validator(mode="after")
    def convert_legacy_markdown_to_model(self):
        """Convert legacy inline markdown string to Markdown model for backwards compatibility."""
        # If markdown is a plain string (legacy format), convert to Markdown model
        if isinstance(self.markdown, str) and not self.markdown.startswith("ref("):
            # Create a Markdown model from the string (no name - it's embedded, not referenced)
            align = self.align if self.align is not None else "left"
            justify = self.justify if self.justify is not None else "start"
            self.markdown = Markdown(
                content=self.markdown,
                align=align,
                justify=justify,
            )
            # Mark as converted from legacy string for deprecation detection
            self.markdown._converted_from_legacy_string = True
            # Clear the deprecated fields since they're now on the Markdown model
            self.align = None
            self.justify = None
        return self

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
        if self.selector is not None:
            return self.selector
        if self.input is not None:
            return self.input
        if self.markdown is not None and isinstance(self.markdown, Markdown):
            return self.markdown
