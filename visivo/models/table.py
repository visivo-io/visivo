from typing import Any, List, Optional, TypeAlias

from visivo.models.base.selector_model import SelectorModel
from visivo.models.insight import Insight
from visivo.models.table_column_definition import TableColumnDefinition
from visivo.models.trace import Trace
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
        model: ref(revenue-model)

    tables:
      - name: revenue-table
        insight: ref(monthly-revenue)
        rows_per_page: 100
    ```

    Tables are built on the [material react table framework](https://www.material-react-table.com/).
    """

    insight: Optional[InsightRef] = Field(
        None,
        description="A ref() to an insight. Data and columns auto-generated from insight query results.",
    )

    traces: List[TraceRef] = Field(
        [],
        description="A ref() to a trace or trace defined in line. Data for the table will come from the trace.",
    )
    insights: List[InsightRef] = Field(
        [],
        description="A ref() to a insight or insight defined in line. Data for the table will come from the insight.",
    )

    column_defs: Optional[List[TableColumnDefinition]] = Field(
        None,
        description="A list of column definitions. These definitions define the columns for a given trace included in this table.",
    )

    rows_per_page: RowsPerPageEnum = Field(
        RowsPerPageEnum.fifty, description="The number of rows to show per page. Default is 50 rows"
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
    def validate_column_defs(cls, data: Any):
        traces, insights, column_defs = (
            data.get("traces"),
            data.get("insights"),
            data.get("column_defs"),
        )

        if not column_defs:
            return data

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

        return data
