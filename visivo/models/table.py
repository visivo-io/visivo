import re
from typing import Any, List, Optional, Union
from typing_extensions import Annotated

from visivo.models.insight import Insight
from visivo.models.format_cells import FormatCells
from pydantic import Field, Discriminator, Tag
from visivo.models.base.named_model import NamedModel
from visivo.models.base.parent_model import ParentModel
from visivo.models.base.base_model import (
    RefStringType,
    ContextStringType,
)
from visivo.models.base.context_string import CONTEXT_STRING_VALUE_PATTERN
from visivo.models.models.sql_model import SqlModel
from visivo.models.models.csv_script_model import CsvScriptModel
from visivo.models.models.local_merge_model import LocalMergeModel
from visivo.query.patterns import extract_ref_names

from pydantic import model_validator
from enum import IntEnum


def get_data_discriminator_value(value):
    if isinstance(value, str) and re.search(CONTEXT_STRING_VALUE_PATTERN, value):
        return "Context"
    elif isinstance(value, str):
        return "Ref"
    elif isinstance(value, dict):
        if "interactions" in value or "props" in value:
            return "Insight"
        elif "args" in value:
            return "CsvScript"
        elif "models" in value:
            return "LocalMerge"
        elif "sql" in value:
            return "Sql"
    elif isinstance(value, Insight):
        return "Insight"
    elif isinstance(value, SqlModel):
        return "Sql"
    elif isinstance(value, CsvScriptModel):
        return "CsvScript"
    elif isinstance(value, LocalMergeModel):
        return "LocalMerge"
    return None


DataRefField = Annotated[
    Union[
        RefStringType,
        ContextStringType,
        Annotated[Insight, Tag("Insight")],
        Annotated[SqlModel, Tag("Sql")],
        Annotated[CsvScriptModel, Tag("CsvScript")],
        Annotated[LocalMergeModel, Tag("LocalMerge")],
    ],
    Discriminator(get_data_discriminator_value),
]


class RowsPerPageEnum(IntEnum):
    three = 3
    five = 5
    ten = 15
    twenty_five = 25
    fifty = 50
    one_hundred = 100
    five_hundred = 500
    one_thousand = 1000


class Table(NamedModel, ParentModel):
    """
    Tables enable you to represent data in a tabular format.

    Use `data` for simple tables that show all columns from a model or insight.
    Use `columns` to select and rename specific columns. Add `rows` and `values`
    to create a pivot table.

    ### Simple Table
    ``` yaml
    tables:
      - name: revenue-table
        data: ${ref(monthly-revenue)}
        rows_per_page: 100
    ```

    ### Column Selection
    ``` yaml
    tables:
      - name: custom-table
        columns:
          - ${ref(sales-insight).region} as Region
          - ${ref(sales-insight).revenue} as "Total Revenue"
    ```

    ### Pivot Table
    ``` yaml
    tables:
      - name: revenue-pivot
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
    """

    data: Optional[DataRefField] = Field(
        None,
        description="A ${ ref() } to a model or insight. Shows all columns from the data source.",
    )

    rows_per_page: RowsPerPageEnum = Field(
        RowsPerPageEnum.fifty,
        description="The number of rows to show per page. Default is 50 rows",
    )

    columns: Optional[List[str]] = Field(
        None,
        description="Column fields using ${ref(name).field} syntax. "
        "Use alone for column selection/renaming, or with rows and values for pivot tables.",
    )
    rows: Optional[List[str]] = Field(
        None,
        description="Pivot row fields using ${ref(name).field} syntax. Requires columns and values.",
    )
    values: Optional[List[str]] = Field(
        None,
        description="Pivot value expressions with inline aggregation, "
        "e.g. [sum(${ref(insight).revenue})]. Requires columns and rows.",
    )
    format_cells: Optional[FormatCells] = Field(
        None,
        description="Gradient/heatmap cell formatting configuration.",
    )

    def child_items(self):
        items = []
        if self.data:
            items.append(self.data)

        all_ref_strings = []
        for field_list in [self.columns, self.rows, self.values]:
            if field_list:
                all_ref_strings.extend(field_list)

        if all_ref_strings:
            ref_names = set()
            for ref_str in all_ref_strings:
                ref_names.update(extract_ref_names(ref_str))
            for name in ref_names:
                items.append(f"ref({name})")

        return items

    @model_validator(mode="before")
    @classmethod
    def validate_table_config(cls, data: Any):
        has_data = data.get("data") is not None
        has_columns = data.get("columns") is not None
        has_rows = data.get("rows") is not None
        has_values = data.get("values") is not None

        if has_data and (has_columns or has_rows or has_values):
            raise ValueError(
                "'data' cannot be combined with 'columns', 'rows', or 'values'. "
                "Use 'data' for simple tables, or 'columns'/'rows'/'values' for selection/pivot."
            )

        if has_rows != has_values:
            raise ValueError("'rows' and 'values' must be specified together.")

        if has_rows and not has_columns:
            raise ValueError("'columns' must be specified when using 'rows' and 'values'.")

        return data
