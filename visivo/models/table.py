from typing import Any, List, Optional

from visivo.models.base.selector_model import SelectorModel
from visivo.models.selector import Selector
from visivo.models.table_column_definition import TableColumnDefinition
from .trace import Trace
from pydantic import Field
from .base.named_model import NamedModel
from .base.parent_model import ParentModel
from .base.base_model import REF_REGEX, generate_ref_field
from pydantic import model_validator


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
        None,
        description="A list of column definitions. These definitions define the columns for a given trace included in this table.",
    )

    def child_items(self):
        return self.traces + [self.selector]

    @property
    def trace_objs(self) -> List[Trace]:
        return list(filter(Trace.is_obj, self.traces))

    @property
    def trace_refs(self) -> List[str]:
        return list(filter(Trace.is_ref, self.traces))

    @model_validator(mode="before")
    @classmethod
    def validate_column_defs(cls, data: any):
        traces, column_defs = (data.get("traces"), data.get("column_defs"))

        if not column_defs:
            return data

        column_defs_trace_names = list(map(lambda cd: cd["trace_name"], column_defs))
        traces_trace_names = list(map(lambda t: NamedModel.get_name(t), traces))
        for column_defs_trace_name in column_defs_trace_names:
            if not column_defs_trace_name in traces_trace_names:
                raise ValueError(
                    f"Column def trace name '{column_defs_trace_name}' is not present in trace list on table."
                )
        return data

    @model_validator(mode="before")
    @classmethod
    def ensure_selector(cls, data: Any) -> Any:
        selector = data.get("selector")
        if selector is None:
            name = data.get("name")
            data["selector"] = {"name": f"{name} Selector", "type": "single"}

        return data
