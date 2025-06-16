from typing import Any, List, Optional

from visivo.models.base.selector_model import SelectorModel
from visivo.models.table_column_definition import TableColumnDefinition
from .trace import Trace
from pydantic import Field
from .base.named_model import NamedModel
from .base.parent_model import ParentModel
from .base.base_model import REF_REGEX, generate_ref_field
from pydantic import model_validator
from enum import IntEnum
from .models.model import Model


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
    Tables enable you to quickly represent trace data in a tabular format.

    You can now build a table directly from a model, or from traces.

    ## Example: Table from Model
    ``` yaml
    models:
      - name: table-model
        sql: |
            select * from visivo_project
    tables:
      - name: latest-projects-table
        model: ref(table-model)
    ```

    ## Example: Table from Traces
    ``` yaml
    models:
      - name: table-model
        sql: |
            select * from visivo_project
    traces:
      - name: pre-table-trace
        model: ref(table-model)
        
        props:
            type: scatter
            x: ?{project_created_at}
            y: ?{project_name}
    tables:
      - name: latest-projects-table
        traces:
          - ref(pre-table-trace)
        column_defs:
          - trace_name: pre-table-trace
            columns:
            - header: "Project Name"
              key: columns.project_name
            ...
    ```
    Tables are built on the [material react table framework](https://www.material-react-table.com/).
    """

    traces: List[generate_ref_field(Trace)] = Field(
        [],
        description="A ref() to a trace or trace defined in line.  Data for the table will come from the trace.",
    )

    model: Optional[generate_ref_field(Model)] = Field(
        None,
        description="A ref() to a model. If set, the table will display all columns from the model's SQL.",
    )

    column_defs: Optional[List[TableColumnDefinition]] = Field(
        None,
        description="A list of column definitions. These definitions define the columns for a given trace included in this table.",
    )

    rows_per_page: RowsPerPageEnum = Field(
        RowsPerPageEnum.fifty, description="The number of rows to show per page. Default is 50 rows"
    )

    def child_items(self):
        children = []
        if self.model:
            children.append(self.model)
        if self.traces:
            children += self.traces
        if self.selector:
            children.append(self.selector)
        return children

    @model_validator(mode="before")
    @classmethod
    def validate_column_defs(cls, data: any):
        traces, column_defs, model = (
            data.get("traces"),
            data.get("column_defs"),
            data.get("model"),
        )

        # Ensure only one of 'traces' or 'model' is set
        if model and traces and len(traces) > 0:
            raise ValueError("Table cannot have both 'model' and 'traces' set. Choose one.")

        if not column_defs:
            return data

        if traces and len(traces) > 0:
            column_defs_trace_names = list(map(lambda cd: cd["trace_name"], column_defs))
            traces_trace_names = list(map(lambda t: NamedModel.get_name(t), traces))
            for column_defs_trace_name in column_defs_trace_names:
                if not column_defs_trace_name in traces_trace_names:
                    raise ValueError(
                        f"Column def trace name '{column_defs_trace_name}' is not present in trace list on table."
                    )
        return data
