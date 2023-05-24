import re
from pydantic import root_validator
from .base_model import BaseModel, REF_REGEX
from .test import Test
from .trace_props import TraceProps
from .trace_columns import TraceColumns
from typing import Optional, List
from collections import Counter


class InvalidTestConfiguration(Exception):
    pass


class Trace(BaseModel):
    """
    The Trace is one of the most important and unique objects within a Visivo Project. You can think of traces as collection of lines or bars on a chart. For example, `Total Revenue by Week` would be a trace. Once you define this metric in a single trace in your project, you can add it to as many charts as you want. This is especially powerful since charts are able to join disparate axis automatically. Meaning you can define a trace for `Revenue Per Week` and then define another trace for `Revenue per Day` and include both of those traces on the same chart with no extra configuration needed.

    This approach has a few key advantages:

    * **Modularity**: Traces are repeatable across as many charts as you need.
    * **Single Source of Truth**: Traces are singularly defined once in your project.
    * **Testable**: Attributes of Traces are testable with simple configurations to make assertions about relationships that you expect to see in your data (ie. revenue = 300,000 on the week of 2022-09-19)

    Sometimes you might want to create a number of different series within a trace. For example you might want to know `Revenue Per Week by Account Executive`. You can use the `cohort_on` attribute to split out data into different series within a single trace.

    Traces are also where you define how you want to represent your data visually. Since Visivo leverages plotly for charting, you can set up a number of unique and useful trace types that are also highly customizable. This includes

    * Bar
    * Scatter
    * Line
    * Surface
    * Area
    * Pie
    * OHLC (Candle Sticks)
    * Funnel
    * ...and many more
    * Full List here: [Plotly Docs](https://plotly.com/javascript/reference/index/)

    ## Example
    ```  yaml
    traces:
      - name: crypto ohlc
        base_sql: "SELECT * FROM finance_data_atlas.FINANCE.CMCCD2019"
        target_name: remote-snowflake
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

    ## Configuration Attributes
    """

    target_name: Optional[str]
    changed: Optional[bool] = True
    base_sql: str
    cohort_on: Optional[str]
    order_by: Optional[List[str]]
    filters: Optional[List[str]]
    tests: Optional[List[dict]]
    columns: Optional[TraceColumns]
    props: Optional[TraceProps]

    def all_tests(self) -> List[Optional[Test]]:
        tests = []
        type_counter = Counter()
        for test in self.tests:
            if len(test.keys()) > 1:
                # TODO Move this to validation
                raise InvalidTestConfiguration(
                    f"Test in {self.name} has more than one type key"
                )
            type = list(test.keys())[0]
            type_counter.update({type: 1})
            kwargs = test[type]
            name = f"{self.name}-{type}-{type_counter[type]}"
            tests.append(Test(name=name, type=type, kwargs=kwargs))
        return tests

    @root_validator
    def validate_column_refs(cls, values):
        columns, props = (values.get("columns"), values.get("props"))
        if columns is None:
            return values

        columnKeys = list(columns.dict().keys())
        pattern = r"column\((.+)\)"
        for value in props.dict().values():
            match = re.search(pattern, str(value))
            if match:
                value = match.group(1)
                if value not in columnKeys:
                    raise ValueError(
                        f"referenced column name '{value}' is not in columns definition"
                    )

        return values
