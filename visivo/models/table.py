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
from visivo.query.patterns import extract_ref_names, replace_refs

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
        elif "sql" in value:
            return "Sql"
    elif isinstance(value, Insight):
        return "Insight"
    elif isinstance(value, SqlModel):
        return "Sql"
    return None


DataRefField = Annotated[
    Union[
        RefStringType,
        ContextStringType,
        Annotated[Insight, Tag("Insight")],
        Annotated[SqlModel, Tag("Sql")],
    ],
    Discriminator(get_data_discriminator_value),
]


class RowsPerPageEnum(IntEnum):
    three = 3
    five = 5
    ten = 10
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
          scope: column
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

    def ref_names(self) -> set:
        """Names of every object referenced from ``columns`` / ``rows`` / ``values``."""
        names = set()
        for field_list in (self.columns, self.rows, self.values):
            for ref_str in field_list or []:
                names.update(extract_ref_names(ref_str))
        return names

    def child_items(self):
        items = []
        if self.data:
            items.append(self.data)
        items.extend(f"ref({name})" for name in self.ref_names())
        return items

    @model_validator(mode="before")
    @classmethod
    def validate_table_config(cls, data: Any):
        has_data = data.get("data") is not None
        # Truthy, not `is not None`: an EMPTY list means "not specified". Treating
        # `columns: []` as present let a `columns: [], rows: [...], values: [...]`
        # config slip past the structural checks below, producing an invalid
        # empty-`ON` pivot that only failed in the browser (bug #7 review, M2).
        has_columns = bool(data.get("columns"))
        has_rows = bool(data.get("rows"))
        has_values = bool(data.get("values"))

        if has_data and (has_columns or has_rows or has_values):
            raise ValueError(
                "'data' cannot be combined with 'columns', 'rows', or 'values'. "
                "Use 'data' for simple tables, or 'columns'/'rows'/'values' for selection/pivot."
            )

        if has_rows != has_values:
            raise ValueError("'rows' and 'values' must be specified together.")

        if has_rows and not has_columns:
            raise ValueError("'columns' must be specified when using 'rows' and 'values'.")

        # Only iterate a real list; any other type is left to the field's own
        # `List[str]` validation (a string would otherwise iterate per character).
        if has_values and isinstance(data["values"], list):
            for value in data["values"]:
                _assert_aggregate_value(value)

        return data


# Pivot `values` are evaluated by DuckDB (`PIVOT ... USING <value>`), which
# requires each entry to be a single aggregate call. Nothing on the Python side
# used to check that, so `values: ["${ref(x).col}"]` compiled and only failed
# in the browser with "Invalid value expression" (VIS-1463 T3). Parse the
# expression with SQLGlot (never a regex) and require the ROOT node to be an
# aggregate function: `count(*)`, `sum(x)`, `avg(x)`, `min(x)`, `max(x)`,
# `count(distinct x)`, `sum(x) filter (where ...)` and ordered-set aggregates
# pass; a bare column, `sum(x) + 1` (Add), a window function (Window),
# `coalesce(sum(x), 0)` (Coalesce), `cast(sum(x) as int)` (Cast), a scalar
# function (`upper(x)`) and a literal fail.
#
# NOTE: this is a load-time (model) check, unlike the generated-SQL syntax check
# in visivo/query/table_sql_validator.py which runs at COMPILE time. A
# non-aggregate value is a config error on a par with `rows` without `values`,
# and the issue asked for it in the model validator — so a project with one
# fails to parse, with the offending value named.
_VALUE_PLACEHOLDER = "__visivo_ref_"

# SQLGlot types these as AggFunc subclasses, but DuckDB only knows them as
# window functions ("Aggregate Function with name lag does not exist").
_WINDOW_ONLY_FUNCTIONS = ("Lag", "Lead", "FirstValue", "LastValue", "NthValue")


def _assert_aggregate_value(value: Any) -> None:
    import sqlglot
    from sqlglot import exp
    from sqlglot.errors import ParseError

    if not isinstance(value, str) or not value.strip():
        raise ValueError(
            f"Pivot value {value!r} is not a valid expression. Each entry in 'values' must be "
            "a single aggregate call, e.g. sum(${ref(insight).revenue})."
        )

    # `${ref(name).field}` is not SQL until it is resolved; swap each ref for a
    # plain identifier so SQLGlot sees a parseable expression, remembering the
    # original text so error messages can show what the user wrote.
    placeholders = {}

    def _placeholder(model_name, field_name):
        token = f"{_VALUE_PLACEHOLDER}{len(placeholders) + 1}"
        placeholders[token] = (
            f"${{ref({model_name}).{field_name}}}" if field_name else f"${{ref({model_name})}}"
        )
        return token

    sql = replace_refs(value, _placeholder)

    def _user_facing(text: str) -> str:
        for token, original in placeholders.items():
            text = text.replace(token, original)
        return text

    try:
        statements = sqlglot.parse(sql, read="duckdb")
    except ParseError as e:
        first_line = (str(e).splitlines() or [str(e)])[0]
        raise ValueError(
            f"Pivot value '{value}' could not be parsed as SQL: {_user_facing(first_line)} "
            "Each entry in 'values' must be a single aggregate call, "
            "e.g. sum(${ref(insight).revenue})."
        ) from None

    statements = [s for s in statements if s is not None]
    if len(statements) != 1:
        raise ValueError(
            f"Pivot value '{value}' must be a single expression (found "
            f"{len(statements)} statements). Each entry in 'values' must be one aggregate "
            "call, e.g. sum(${ref(insight).revenue})."
        )
    parsed = statements[0]

    # Look through the pieces of an aggregate call's own syntax: the FILTER
    # clause (`sum(x) filter (where ...)`), ordered-set aggregates
    # (`percentile_cont(0.5) within group (order by x)`), and the null-handling
    # modifiers SQLGlot wraps `any_value(x)` / `first(x ignore nulls)` in.
    while isinstance(parsed, (exp.Filter, exp.WithinGroup, exp.IgnoreNulls, exp.RespectNulls)):
        parsed = parsed.this

    if type(parsed).__name__ in _WINDOW_ONLY_FUNCTIONS:
        raise ValueError(
            f"Pivot value '{value}' is a window function, not an aggregate. Each entry in "
            "'values' must be a single aggregate call such as sum(...), avg(...), min(...), "
            "max(...), count(...) or count(distinct ...)."
        )

    # SQLGlot models only part of DuckDB's aggregate library: `mode(x)`,
    # `product(x)`, `histogram(x)`, `entropy(x)`, `kurtosis(x)` and any UDF come
    # back as `Anonymous` (an unknown function call). Those are still a single
    # call that DuckDB type-checks itself, so they are not rejected here — only
    # shapes SQLGlot positively identifies as NOT an aggregate call are. (An
    # unknown scalar function therefore still fails in the browser.)
    if not isinstance(parsed, (exp.AggFunc, exp.Anonymous)):
        raise ValueError(
            f"Pivot value '{value}' is not an aggregate. Each entry in 'values' must be a "
            "single aggregate call such as sum(...), avg(...), min(...), max(...), "
            "count(...) or count(distinct ...); arithmetic, casts or scalar functions around "
            "the aggregate, window functions and bare columns are not allowed."
        )
