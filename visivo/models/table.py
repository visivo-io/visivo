from typing import List, Optional

from visivo.models.table_column_definition import TableColumnDefinition
from .trace import Trace
from pydantic import Field
from .base.named_model import NamedModel
from .base.parent_model import ParentModel
from .base.base_model import REF_REGEX, generate_ref_field


class Table(NamedModel, ParentModel):
    """
    Tables enable you to quickly represent trace data in a tabular format.

    Since tables sit on top of trace data, the steps to create a table from scratch are as follows:

    1. Create a model.
    1. Create a trace with columns or props that references your model.
    1. Create a table that references the trace. Within the table.columns block you will need to explicitly state the trace columns and header names that you want to include.

    ??? note

        We're actively working on improving the table interface by making it possible to define tables directly from models and incorporating more features from material react table such as [aggregation & grouping](https://www.material-react-table.com/docs/guides/aggregation-and-grouping).

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
            - header: "Account Name"
              key: columns.account_name
            - header: "Account Name"
              key: columns.stage_archived
    ```
    Tables are built on the [material react table framework](https://www.material-react-table.com/).
    """

    traces: List[generate_ref_field(Trace)] = Field(
        [],
        description="A ref() to a trace or trace defined in line.  Data for the table will come from the trace.",
    )

    column_defs: Optional[List[TableColumnDefinition]] = Field(
        description="A list of column definitions. These definitions define the columns for a given trace included in this table.",
    )

    def child_items(self):
        return self.traces

    @property
    def trace_objs(self) -> List[Trace]:
        return list(filter(Trace.is_obj, self.traces))

    @property
    def trace_refs(self) -> List[str]:
        return list(filter(Trace.is_ref, self.traces))
