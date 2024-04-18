import pydantic


class TraceColumns(pydantic.BaseModel):
    """
    Trace Columns enable you to reuse query elements as columns throughout multiple different areas within the trace.
    !!! tip

        Using Trace Columns can help reduce copy and paste code!

    Trace Columns perform the same basic service that the `query()` function does- allowing you to define sql select statements.

    !!! example {% raw %}

        === "With Inline `query()` Function"

            ``` yaml
            - name: Simple Line
              model: ref(test-table)
              props:
                type: bar
                x: query(x)
                y: query(y)
                marker:
                  color: query( case when x >= 5 then '#713B57' else 'grey' end )
                  line:
                    color: query( case when x >= 5 then '#713B57' else 'grey' end )
                pattern:
                  shape: query( case when x = 5 then '/' when x = 6 THEN 'x' else '' end )
                line:
                  width: query( Case when x in (5,6) then 2.5 else null end)
            ```

        === "With Trace Columns"

            ``` yaml
            - name: Simple Line
              model: ref(test-table)
              columns:
                x_data: x
                y_data: y
                color: case when x >= 5 then '#713B57' else 'grey' end
                shape: case when x = 5 then '/' when x = 6 THEN 'x' else '' end
                width: case when x in (5,6) then 2.5 else null end
              props:
                type: bar
                x: column(x_data)
                y: column(y_data)
                marker:
                  color: column(color)
                  line:
                    color: column(color)
                pattern:
                  shape: column(shape)
                line:
                  width: column(width)
            ```
    {% endraw %}

    ## Indexing Arrays
    Another reason to use trace Columns is because they allow you to grab a value from the column array by the columns index.
    Since `query()` and `column()` always return arrays, being able to slice the column enables setting string and numeric
    trace prop attributes dynamically as well.

    !!! example

        A great example of a situation where you would want to use Column indexing are indicator traces.
        ``` yaml
        - name: Indicator Trace
          model: ref(csv)
          columns:
          x_data: x
          y_data: y
          props:
            type: "indicator"
            mode: "number+delta"
            value: column(y_data)[0]
            number:
              prefix: "$"
            delta:
              position: "top"
              reference: column(y_data)[1]
        ```
        In the trace above `column(y_data)[0]` is pulling the first item in the array as the value and comparing its delta to the second item in the column y_data array.


    """

    model_config = pydantic.ConfigDict(extra="allow")
