import re
from typing import Any, Dict, Literal
from pydantic import BaseModel, Field, model_validator
from visivo.models.fields import QueryOrStringField
from visivo.models.models.fields import ModelRefField
from visivo.models.trace_props.trace_props import TraceProps
from visivo.models.base.named_model import NamedModel
from visivo.models.base.parent_model import ParentModel
from visivo.models.test import Test
from visivo.models.trace_columns import TraceColumns
from typing import Optional, List


class InvalidTestConfiguration(Exception):
    pass


class TestClass(BaseModel):
    type: Literal["test"]


class Trace(NamedModel, ParentModel):
    """
    The Trace is one of the most important objects within a Visivo Project. You can think of a trace as a single series on a chart (ie. one line, a sequence of bars, a big number ect.).
    {% raw %}
    !!! example
        `Total Revenue by Week` would be a trace. Once you define this metric in a single trace in your project, you can add it to as many charts as you want. This is especially powerful since charts are able to join disparate axis automatically. Meaning you can define a trace for `Revenue Per Week` and then define another trace for `Revenue per Day` and include both of those traces on the same chart with no extra configuration needed.

    This approach has a few key advantages:

    * **Modularity**: Traces can appear on multiple charts & tables.
    * **Single Source of Truth**: Traces are a single source of truth.
    * **Testable**: You can write  general & fast tests to ensure that trace data is correct.

    ## Cohorts
    To easily cut a trace into multiple cohorts you can use the `cohort_on` attribute.
    !!! example
        To represent `Revenue Per Week by Account Executive`. You can use the `cohort_on` attribute to split out data into different series within a single trace.
        ``` yaml
        traces:
          - name: rev-per-week-by-account-executive
            cohort_on: "account_executive_name"
            model: ref(orders)
            columns:
              week: date_trunc('week', "order_date")
              orders: count(*)
            props:
              type: bar
              x: column(week)
              y: column(orders)
        ```

    Traces are also where you define how you want to represent your data visually. Since Visivo leverages plotly for charting, you can set up a number of unique and useful trace types that are also highly customizable. See types below.

    ## Example
    ```  yaml
    traces:
      - name: crypto ohlc
        model:
          sql: 'SELECT * finance_data_atlas.FINANCE.CMCCD2019'
        source_name: remote-snowflake
        cohort_on: ?{ "Cryptocurrency Name" }
        props:
          type: ohlc
          x: ?{ date_trunc('week', "Date")::date::varchar }
          close: ?{ max_by("Value", "Date") }
          high: ?{ max("Value") }
          low: ?{ min("Value") }
          open: ?{ min_by("Value", "Date") }
          increasing:
            line:
              color: 'green'
          decreasing:
            line:
              color: 'red'
          xaxis: 'x'
          yaxis: 'y'
        filters:
        - ?{"Date" >= '2015-01-01'}
        - ?{ "Cryptocurrency Name" in ('Bitcoin (btc)', 'Ethereum (eth)', 'Dogecoin (doge)') }
        - ?{ "Measure Name" = 'Price, USD' }
    ```
    {% endraw %}
    """

    name: str = Field(
        alias="name",
        description="The unique name of the object across the entire project.",
    )
    model: ModelRefField = Field(
        ...,
        description="The model or model ref that Visivo should use to build the trace.",
    )
    cohort_on: Optional[QueryOrStringField] = Field(
        None,
        description="`cohort_on` enables splitting the trace out into different series or cohorts. The column or query referenced here will be used to cut the resulting trace.",
    )
    order_by: Optional[List[QueryOrStringField]] = Field(
        None,
        description="Takes a `column()` or `?{}` reference. Orders the dataset so that information is presented in the correct order when the trace is added to a chart. Order by query statements support using `asc` and `desc`.",
    )
    filters: Optional[List[QueryOrStringField]] = Field(
        None,
        description="A list of `column()` or `?{}` functions that evaluate to `true` or `false`. Can include aggregations in the sql statement.",
    )
    tests: Optional[List[Test]] = Field(
        None,
        description="A list of tests to run against the trace data. Enables making assertions about the nullability of data and relationships between data.",
    )
    columns: Optional[TraceColumns] = Field(
        None,
        description="Place where you can define named sql select statements. Once they are defined here they can be referenced in the trace props or in tables built on the trace.",
    )
    props: TraceProps = Field(
        None,
        description="Trace props are the properties that are used to configure the trace.",
    )

    def child_items(self):
        children = [self.model]
        if self.tests:
            children += self.tests
        return children

    @model_validator(mode="before")
    @classmethod
    def validate_column_refs(cls, data: Any):
        if isinstance(data, str):
            return data
        columns, props = (data.get("columns"), data.get("props"))
        if columns is None or props is None:
            return data

        columnKeys = list(columns.keys())
        pattern = r"column\(([^\)]+)\)"
        for value in props.values():
            match = re.search(pattern, str(value))
            if match:
                value = match.group(1)
                if value not in columnKeys:
                    raise ValueError(
                        f"referenced column name '{value}' is not in columns definition"
                    )

        return data
