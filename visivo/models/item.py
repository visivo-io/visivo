from visivo.models.base.named_model import NamedModel
from visivo.models.inputs.fields import InputField
from visivo.models.base.base_model import generate_ref_field
from visivo.models.base.parent_model import ParentModel
from visivo.models.markdown import Markdown
from pydantic import Field, model_validator
from typing import List, Optional, TYPE_CHECKING
from visivo.models.chart import Chart
from visivo.models.table import Table

if TYPE_CHECKING:
    from visivo.models.row import Row


class Item(NamedModel, ParentModel):
    """
    The Item houses a single chart, table, markdown, or input object — or a list of nested rows.

    It also informs the width that the chart, table, markdown, or row-container should occupy within a row. Widths are evaluated for each item in a row relative to all of the other items in the row.

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

    ## Nested rows (row-container items)

    An Item can also act as a row-container by setting `rows` instead of a leaf object. The
    item's `rows` are a list of nested rows that render as a vertical stack inside the slot
    the parent row reserved for the item. Heights of nested rows are interpreted as
    *relative weights* inside the parent slot.

    Row-container items live as siblings of leaf items inside a row's `items`, so a single
    row can mix charts, markdowns, tables, inputs, and row-containers freely.

    ``` yaml
    rows:
      - height: large
        items:
          - width: 2
            chart: ref(big-chart)
          - width: 1
            rows:
              - height: small
                items: [{ chart: ref(small-a) }]
              - height: small
                items: [{ chart: ref(small-b) }]
              - height: small
                items: [{ chart: ref(small-c) }]
    ```

    `rows` is mutually exclusive with `markdown`, `chart`, `table`, and `input` — at most one
    of the five may be set on a given item.
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
    rows: Optional[List["Row"]] = Field(
        None,
        description=(
            "An optional list of nested rows. When set, this item renders as a "
            "row-container inside the slot the parent row reserved for it. "
            "Mutually exclusive with markdown/chart/table/input. Each sub-row "
            "carries its own `height`, which is interpreted as a relative weight "
            "inside the parent slot."
        ),
    )

    @model_validator(mode="before")
    @classmethod
    def validate_unique_item_types(cls, data: any):
        markdown, chart, table, input, rows = (
            data.get("markdown"),
            data.get("chart"),
            data.get("table"),
            data.get("input"),
            data.get("rows"),
        )
        items_set = [i for i in [markdown, chart, table, input, rows] if i is not None]
        if len(items_set) > 1:
            raise ValueError(
                'only one of the "markdown", "chart", "table", "input", or "rows" '
                "properties should be set on an item"
            )
        return data

    def child_items(self):
        if self.rows:
            return list(self.rows)
        child = self.__get_child()
        if child:
            return [child]
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


# Self-bootstrap the recursive forward reference. Item.rows references "Row" by string
# (forward reference), and row.py defines Row + calls Item.model_rebuild() at its end.
# Importing the row module here ensures the rebuild runs whenever Item is imported
# directly. Python's circular-import handling tolerates this: the row module's top-level
# "from visivo.models.item import Item" sees the already-defined Item in the partially
# loaded module. The rebuild is idempotent if row.py was already loaded.
import visivo.models.row  # noqa: E402,F401
