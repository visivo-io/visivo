from typing import Any, List, Optional, TypeAlias

from visivo.models.base.selector_model import SelectorModel
from visivo.models.insight import Insight
from visivo.models.table_column_definition import TableColumnDefinition
from visivo.models.trace import Trace
from visivo.models.format_cells import FormatCells
from pydantic import Field
from visivo.models.base.named_model import NamedModel
from visivo.models.base.parent_model import ParentModel
from visivo.models.base.base_model import generate_ref_field

from pydantic import model_validator
from enum import IntEnum

TraceRef: TypeAlias = generate_ref_field(Trace)
InsightRef: TypeAlias = generate_ref_field(Insight)


class RowsPerPageEnum(IntEnum):
    three = 3
    five = 5
    ten = 15
    twenty_five = 25
    fifty = 50
    one_hundred = 100
    five_hundred = 500
    one_thousand = 1000


class Table(SelectorModel, NamedModel, ParentModel):
    """
    Tables enable you to quickly represent insight data in a tabular format.

    Tables auto-generate columns from insight query results. To customize column headers,
    use SQL aliases in your insight query (e.g., `SELECT revenue AS "Total Revenue"`).

    ### Example
    ``` yaml
    insights:
      - name: monthly-revenue
        props:
          x: ?{ month AS "Month" }
          y: ?{ sum(revenue) AS "Total Revenue" }
        model: ${ref(revenue-model)}

    tables:
      - name: revenue-table
        insight: ${ref(monthly-revenue)}
        rows_per_page: 100
    ```

    ### Pivot Table Example
    ``` yaml
    tables:
      - name: revenue-pivot
        insight: ${ref(sales-insight)}
        columns:
          - ${ref(sales-insight).region}
        rows:
          - ${ref(sales-insight).product}
        values:
          - sum(${ref(sales-insight).revenue})
        format_cells:
          scope: columns
          min_color: "#ff0000"
          max_color: "#00ff00"
    ```

    Tables are built on the [material react table framework](https://www.material-react-table.com/).
    """

    insight: Optional[InsightRef] = Field(
        None,
        description="A ${ref()} to an insight. Data and columns auto-generated from insight query results.",
    )

    traces: List[TraceRef] = Field(
        [],
        description="A ${ref()} to a trace or trace defined in line. Data for the table will come from the trace.",
    )
    insights: List[InsightRef] = Field(
        [],
        description="A ${ref()} to an insight or insight defined in line. Data for the table will come from the insight.",
    )

    column_defs: Optional[List[TableColumnDefinition]] = Field(
        None,
        description="A list of column definitions. These definitions define the columns for a given trace included in this table.",
    )

    rows_per_page: RowsPerPageEnum = Field(
        RowsPerPageEnum.fifty, description="The number of rows to show per page. Default is 50 rows"
    )

    columns: Optional[List[str]] = Field(
        None,
        description="Pivot column fields using ${ref(insight).field} syntax.",
    )
    rows: Optional[List[str]] = Field(
        None,
        description="Pivot row fields using ${ref(insight).field} syntax.",
    )
    values: Optional[List[str]] = Field(
        None,
        description="Pivot value expressions with inline aggregation, e.g. [sum(${ref(insight).revenue})].",
    )
    format_cells: Optional[FormatCells] = Field(
        None,
        description="Gradient/heatmap cell formatting configuration.",
    )

    def child_items(self):
        items = list(self.traces) + list(self.insights)
        if self.insight:
            items.append(self.insight)
        if self.selector:
            items.append(self.selector)
        return items

    @model_validator(mode="before")
    @classmethod
    def validate_table_config(cls, data: Any):
        traces, insights, column_defs = (
            data.get("traces"),
            data.get("insights"),
            data.get("column_defs"),
        )

        if column_defs:
            trace_names = list(map(lambda t: NamedModel.get_name(t), traces or []))
            insight_names = list(map(lambda i: NamedModel.get_name(i), insights or []))

            for cd in column_defs:
                if "trace_name" in cd and cd["trace_name"] not in trace_names:
                    raise ValueError(
                        f"Column def trace name '{cd['trace_name']}' is not present in trace list on table."
                    )
                if "insight_name" in cd and cd["insight_name"] not in insight_names:
                    raise ValueError(
                        f"Column def insight name '{cd['insight_name']}' is not present in insight list on table."
                    )

        pivot_columns = data.get("columns")
        pivot_rows = data.get("rows")
        pivot_values = data.get("values")
        pivot_fields = [pivot_columns, pivot_rows, pivot_values]
        pivot_set_count = sum(1 for f in pivot_fields if f is not None)

        if pivot_set_count > 0 and pivot_set_count < 3:
            raise ValueError(
                "Pivot configuration requires all three fields: 'columns', 'rows', and 'values'. "
                "Either set all three or none."
            )

        if pivot_set_count == 3 and not data.get("insight"):
            raise ValueError("Pivot configuration requires the 'insight' field to be set.")

        return data
