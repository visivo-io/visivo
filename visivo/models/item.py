from visivo.models.base.named_model import NamedModel
from visivo.models.selector import Selector
from visivo.models.base.base_model import generate_ref_field
from visivo.models.base.parent_model import ParentModel
from pydantic import Field
from typing import Optional, Literal
from visivo.models.chart import Chart
from visivo.models.table import Table
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
    ## Markdown
    You can use markdown to add formatted text to your dashboard. Visivo markdown supports [CommonMark](https://commonmark.org/help/) and [GitHub Flavored Markdown](https://github.github.com/gfm/). You can also
    render raw HTML within your markdown.

    To control the alignment of markdown content, you can use the `align` and `justify` properties.
    === "Horizontal Alignment (align)"
        Controls how text aligns horizontally within the container:

        `align: left` (default)
        ```
        [Header     ]
        [Paragraph  ]
        [List       ]
        ```

        `align: center`
        ```
        [  Header   ]
        [ Paragraph ]
        [   List    ]
        ```

        `align: right`
        ```
        [     Header]
        [  Paragraph]
        [      List]
        ```

    === "Vertical Distribution (justify)"
        Controls how content blocks are distributed vertically in fixed-height containers:

        `justify: start` (default)
        ```
        [Header     ]
        [Paragraph  ]
        [List       ]
        [           ]
        [           ]
        ```

        `justify: center`
        ```
        [           ]
        [Header     ]
        [Paragraph  ]
        [List       ]
        [           ]
        ```

        `justify: between`
        ```
        [Header     ]
        [           ]
        [Paragraph  ]
        [           ]
        [List       ]
        ```

        `justify: around`
        ```
        [           ]
        [Header     ]
        [           ]
        [Paragraph  ]
        [           ]
        [List       ]
        [           ]
        ```

        `justify: evenly`
        ```
        [           ]
        [Header     ]
        [Paragraph  ]
        [List       ]
        [           ]
        ```

        `justify: end`
        ```
        [           ]
        [           ]
        [Header     ]
        [Paragraph  ]
        [List       ]
        ```
    """

    width: int = Field(
        1,
        description="The width of the Item determines is evaluated relative to the other items in a row.",
    )
    markdown: Optional[str] = Field(None, description="Markdown text to include in the dashboard.")
    align: Optional[Literal["left", "center", "right"]] = Field(
        None,
        description="Alignment of markdown content. Only valid when markdown is set. Options are 'left', 'center', or 'right'.",
    )
    justify: Optional[Literal["start", "end", "center", "between", "around", "evenly"]] = Field(
        None,
        description="Justification of markdown content within its container. Options are 'start', 'end', 'center', 'between', 'around', or 'evenly'.",
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

    @model_validator(mode="before")
    @classmethod
    def validate_align_with_markdown(cls, data: any):
        align = data.get("align")
        markdown = data.get("markdown")
        if markdown is not None and align is None:
            data["align"] = "left"
        elif align is not None and markdown is None:
            raise ValueError(
                "The 'align' property can only be set when 'markdown' is present in the same item"
            )
        return data

    @model_validator(mode="before")
    @classmethod
    def validate_justify_with_markdown(cls, data: any):
        justify = data.get("justify")
        markdown = data.get("markdown")
        if markdown is not None and justify is None:
            data["justify"] = "start"
        elif justify is not None and markdown is None:
            raise ValueError(
                "The 'justify' property can only be set when 'markdown' is present in the same item"
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
        if self.selector is not None:
            return self.selector
