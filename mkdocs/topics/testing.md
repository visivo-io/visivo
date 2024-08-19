# Testing

Tests enable you to **quickly** validate data across your project.  

!!! note
    Tests are run with the `visivo test` command (_[docs](../../reference/cli/#test)_).

Tests can run any arbitrary python statement so long as it evaluates to `True` or `False`. Additionally tests can access trace data from across the project by using the `$(project)` context variable. By default trace data arrays will be represented as numpy arrays. 

The combination of python based boolean statements and access to all trace data makes it _super fast_ all while enabling complex assertions about your data. 

!!! example

    === "Revenue Sums Match"
   
        ``` yaml
        tests:
          - name: revenue-date-grains-match
            logic: "numpy.sum( $(project.traces['revenue-per-week'].props.y) ) = numpy.sum( $(project.traces['revenue-per-month'].props.y) )"
        ```

    === "Standard Deviation"
   
        ``` yaml
        tests:
          - name: recent-std-less-double-normal
            logic: "numpy.std( $(project.traces['revenue-per-week'].props.y) ) * 2 > numpy.std( $(project.traces['revenue-per-month'].props.y[:-10]) )"
        ```

    === "Assert Value"
   
        ``` yaml
        tests:
          - name: recent-std-less-double-normal
            logic: "round( $(project.traces['revenue-per-week'].props.y[10]) ) = 2901384"
        ```

You can also define tests within the trace it's self which gives you access to the information of the trace data that you're defining the test on through the `$(trace)` context variable. You can still access the `$(project)` context variable from within the trace definition. 
!!! example 

    ``` yaml
    traces:
        - name: tested-trace
        model: ref(model)
        columns:
            account_name: account_name
        props:
            type: scatter
            x: column(project_created_at)
            y: column(project_name)
        tests:
            - logic: assert_that(numpy.sum( $(trace.props.x) ).is_equal_to(7)
            - logic: 'key account' in $(trace.columns.account_name)
            - logic: numpy.unique( $(trace.columns.account_name) ) = numpy.unique( $(project.traces[another-trace].columns.account_name) ) 
    ```
The `assert_that()` function from the [assertpy](https://assertpy.github.io/) library and the [numpy](https://numpy.org/doc/stable/index.html) library are available to reference. The combination of these two libraries enable a wide array of calculations and logical assertions. 