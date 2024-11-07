import re
import os
from typing import Any, Literal, Union
from pydantic import BaseModel, Field, model_validator
from visivo.models.models.fields import ModelRefField
from visivo.models.trace_props.fields import validate_trace_props
from .base.named_model import NamedModel
from .base.parent_model import ParentModel
from .test import Test
from .trace_columns import TraceColumns
from typing import Optional, List

from visivo.models.trace_props.scatter import Scatter

if os.getenv("EXCLUDE_TRACE_PROPS") != "True":
    from visivo.models.trace_props.fields import TracePropsField


class InvalidTestConfiguration(Exception):
    pass


class TestClass(BaseModel):
    type: Literal["test"]


class Trace(NamedModel, ParentModel):
    """
    The Trace is one of the most important objects within a Visivo Project. You can think of a trace as a single series on a chart (ie. one line, a sequence of bars, a big number ect.).

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
        cohort_on: query( "Cryptocurrency Name" )
        props:
          type: ohlc
          x: query( date_trunc('week', "Date")::date::varchar )
          close: query( max_by("Value", "Date") )
          high: query( max("Value") )
          low: query( min("Value") )
          open: query( min_by("Value", "Date") )
          increasing:
            line:
              color: 'green'
          decreasing:
            line:
              color: 'red'
          xaxis: 'x'
          yaxis: 'y'
        filters:
        - query("Date" >= '2015-01-01')
        - query( "Cryptocurrency Name" in ('Bitcoin (btc)', 'Ethereum (eth)', 'Dogecoin (doge)') )
        - query( "Measure Name" = 'Price, USD' )
    ```
    """

    name: str = Field(
        alias="name",
        description="The unique name of the object across the entire project.",
    )
    changed: Optional[bool] = Field(
        True,
        description="**NOT A CONFIGURATION** attribute is used by the cli to determine if the trace should be re-run",
    )
    model: ModelRefField = Field(
        ...,
        description="The model or model ref that Visivo should use to build the trace.",
    )
    cohort_on: Optional[str] = Field(
        None,
        description="`cohort_on` enables splitting the trace out into different series or cohorts. The column or query referenced here will be used to cut the resulting trace.",
    )
    order_by: Optional[List[str]] = Field(
        None,
        description="Takes a `column()` or `query()` reference. Orders the dataset so that information is presented in the correct order when the trace is added to a chart. Order by query statements support using `asc` and `desc`.",
    )
    filters: Optional[List[str]] = Field(
        None,
        description="A list of `column()` or `query()` functions that evaluate to `true` or `false`. Can include aggregations in the sql statement.",
    )
    tests: Optional[List[Test]] = Field(
        None,
        description="A list of tests to run against the trace data. Enables making assertions about the nullability of data and relationships between data.",
    )
    columns: Optional[TraceColumns] = Field(
        None,
        description="Place where you can define named sql select statements. Once they are defined here they can be referenced in the trace props or in tables built on the trace.",
    )
    if os.getenv("EXCLUDE_TRACE_PROPS") == "True":
        props: Any = Field(Scatter(type="scatter"))
    else:
        props: TracePropsField = Field(Scatter(type="scatter"))

    def child_items(self):
        children = [self.model]
        if self.tests:
            children += self.tests
        return children

    @model_validator(mode="before")
    @classmethod
    def validate_props(cls, data: Any):
        if isinstance(data, str):
            return data

        if "props" in data and isinstance(data["props"], dict):
            data["props"] = validate_trace_props(data["props"])

        return data

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
