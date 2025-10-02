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
    Tables enable you to quickly represent trace data in a tabular format.

    Since tables sit on top of trace data, the steps to create a table from scratch are as follows:

    1. Create a model.
    1. Create a trace with columns or props that references your model.
    1. Create a table that references the trace. Within the table.columns block you will need to explicitly state the trace columns and header names that you want to include.

    ### Example
    ``` yaml
    models:
      - name: table-model
        sql: |
            select
                project_name,
                project_created_at,
                cli_version,
                stage_name,
                account_name,
                stage_archived
            FROM visivo_project
    traces:
      - name: pre-table-trace
        model: ref(table-model)
        columns:
            project_name: project_name
            project_created_at: project_created_at::varchar
            cli_version: cli_version
            stage_name: stage_name
            account_name: account_name
            stage_archived: stage_archived::varchar
        props:
            type: scatter
            x: column(project_created_at)
            y: column(project_name)
    tables:
      - name: latest-projects-table
        traces:
          - ref(pre-table-trace)
        column_defs:
          - trace_name: pre-table-trace
            columns:
            - header: "Project Name"
              key: columns.project_name
            - header: "Project Created At"
              key: columns.project_created_at
            - header: "Project Json"
              key: columns.project_json
            - header: "CLI Version"
              key: columns.cli_version
            - header: "Stage Name"
              key: columns.stage_name
              aggregation: uniqueCount
            - header: "Account Name"
              key: columns.account_name
            - header: "Account Name"
              key: columns.stage_archived
    ```
    Tables are built on the [material react table framework](https://www.material-react-table.com/).
    """

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
        """Return child items for DAG construction"""
        return self.traces + self.insights + [self.selector]

    @model_validator(mode="before")
    @classmethod
    def validate_column_defs(cls, data: any):
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
