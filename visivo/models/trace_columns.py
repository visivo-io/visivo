import re
from typing import Any
from pydantic import BaseModel, ConfigDict, model_validator
from visivo.models.base.query_string import QUERY_STRING_VALUE_REGEX, QueryString


class TraceColumns(BaseModel):
    """
    Trace Columns enable you to reuse query elements as columns throughout multiple different areas within the trace.
    !!! tip

        Using Trace Columns can help reduce copy and paste code!

    Trace Columns perform the same basic service that the `?{}` function does- allowing you to define sql select statements.

    !!! example {% raw %}

        === "With Inline `?{}` Function"

            ``` yaml
            - name: Simple Line
              model: ref(test-table)
              props:
                type: bar
                x: ?{ x }
                y: ?{ y }
                marker:
                  color: ?{ case when x >= 5 then '#713B57' else 'grey' end }
                  line:
                    color: ?{ case when x >= 5 then '#713B57' else 'grey' end }
                pattern:
                  shape: ?{ case when x = 5 then '/' when x = 6 THEN 'x' else '' end }
                line:
                  width: ?{ case when x in (5,6) then 2.5 else null end }
            ```

        === "With Trace Columns"

            ``` yaml
            - name: Simple Line
              model: ref(test-table)
              columns:
                x_data: ?{ x }
                y_data: ?{ y }
                color: ?{ case when x >= 5 then '#713B57' else 'grey' end }
                shape: ?{ case when x = 5 then '/' when x = 6 THEN 'x' else '' end }
                width: ?{ case when x in (5,6) then 2.5 else null end }
              props:
                type: bar
                x: ${ columns.x_data }
                y: ${ columns.y_data }
                marker:
                  color: ${ columns.color }
                  line:
                    color: ${ columns.color }
                pattern:
                  shape: ${ columns.shape }
                line:
                  width: ${ columns.width }
            ```
    {% endraw %}

    ## Slicing & Indexing Column Arrays
    Trace Columns support slicing and indexing, enabling you to pull out sub-arrays or specific values from a given column array.

    ### Indexing
    Some trace configurations require numbers or strings as inputs. For example indicator traces require a single number to represent as the
    big value in the card. Since the `?{}` and `column()` functions always return arrays, indexing allows you to grab a single value
    from the array to use in configurations that require a single value.

    You can index columns by using the following syntax:
    ``` yaml
    column(column_name)[index]
    ```
    The `index` is a zero-based index that represents the position in the array you want to pull out. Negative indexes are also supported,
    allowing you to count from the end of the array. The last value in the array is represented by -1, the second to last by -2, and so on.

    !!! example

        A great example of a situation where you would want to use Column indexing are indicator traces.
        ``` yaml
        - name: Indicator Trace
          model: ref(csv)
          columns:
            x_data: ?{ x }
            y_data: ?{ y }
          props:
            type: "indicator"
            mode: "number+delta"
            value: ?{ columns.y_data[0] }
            number:
              prefix: "$"
            delta:
              position: "top"
              reference: ?{ columns.y_data[1] }
        ```
        In the trace above `column(y_data)[0]` is pulling the first item in the array as the value and comparing its delta to the second item in the column y_data array.

    ### Slicing
    Slicing allows you to pull out a sub-array from a given column array. This is useful when you only want to use a portion of the array in
    a given configuration, but don't want to filter the whole trace.

    You can slice columns by using the following syntax:
    ``` yaml
    column(column_name)[start:stop]
    ```
    The `start` and `stop` values are zero-based indexes that represent the start and end of the slice you want to pull out.
    Negative indexes are also supported, allowing you to count from the end of the array. The last value in the array is represented
    by -1, the second to last by -2, and so on.

    If you omit the stop value, the slice will continue to the end of the array. If you omit the start value, the slice will start at
    the beginning of the array.

    !!! example

        Surface plots can be a really useful place to utilize slicing.
        ``` yaml
        - name: Surface Trace
          model: ${ ref(csv) }
          columns:
            x_data: ?{ x }
            y_data: ?{ y }
          props:
            type: surface
            z:
              - ${ columns.x_data }
              - ${ columns.x_data[0:5] }
              - ${ columns.x_data[5:10] }
              - ${ columns.y_data }
              - ${ columns.y_data[0:5] }
              - ${ columns.y_data[5:10] }
        ```
        The trace above is creating a surface plot with lines on the plane of different lengths that represent different portions
        of the x_data and y_data arrays.

    """

    model_config = ConfigDict(extra="allow")

    @model_validator(mode="before")
    @classmethod
    def validate_unique_item_types(cls, data: any):
        # TODO 1.1: This validator can throw and error
        for field_name, field_value in data.items():
            if isinstance(field_value, str) and re.match(QUERY_STRING_VALUE_REGEX, field_value):
                data[field_name] = QueryString(field_value)
        return data
