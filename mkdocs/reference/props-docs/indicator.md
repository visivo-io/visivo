---
search:
  exclude: true
---
<!--start-->
## Overview

The `indicator` trace type is used to create key performance indicator (KPI) visualizations, allowing you to display single or aggregated values in a gauge or numeric format. Indicators are great for showing metrics like progress, performance, or key values at a glance.

You can customize the gauge, delta values, colors, and text annotations to represent your data effectively. Indicator plots are widely used in dashboards and reporting.

!!! tip "Common Uses"
    - **KPI Dashboards**: Displaying key metrics, progress, or performance indicators.
    - **Gauges**: Visualizing values as a gauge to track goals or targets.
    - **Highlighting Change**: Showing the difference between two points in time.

_**Check out the [Attributes](../configuration/Trace/Props/Indicator/#attributes) for the full set of configuration options**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple Numeric Indicator"

        Here's a simple `indicator` plot displaying a single numeric value:

        ![](../../assets/example-charts/props/indicator/simple-indicator.png)

        You can copy this code below to create this chart in your project:

        ```yaml
        models:
          - name: indicator-data
            args:
              - echo
              - |
                value
                75
        traces:
          - name: Simple Numeric Indicator
            model: ${ref(indicator-data)}
            columns:
              val: value
              sign: case when value > 0 then '<sup>+</sup>' else '<sup>-</sup>' end
            props:
              type: indicator
              mode: "number"
              value: column(val)[0]
              number: 
                suffix: '<sub>hrs</sub>'
                prefix: column(sign)[0]
                font: 
                  size: 100
        charts:
          - name: Simple Numeric Indicator Chart
            traces:
              - ${ref(Simple Numeric Indicator)}
            layout:
              title:
                text: Simple Numeric Indicator<br><sub>Displaying a Single Value</sub>
            margin: 
              l: 0
              r: 0
              b: 50 
        ```

    === "Gauge Indicator"

        This example shows a `gauge` indicator to represent a value and its progress toward a goal:

        ![](../../assets/example-charts/props/indicator/gauge-indicator.png)

        Here's the code:

        ```yaml
        models:
          - name: indicator-data-gauge
            args:
              - echo
              - |
                value
                65
        traces:
          - name: Gauge Indicator
            model: ${ref(indicator-data-gauge)}
            columns: 
              val: value
            props:
              type: indicator
              mode: "gauge+number"
              value: column(val)[0]
              gauge:
                axis:
                  range: [0, 100]
                bar:
                  color: "#17becf"
        charts:
          - name: Gauge Indicator Chart
            traces:
              - ${ref(Gauge Indicator)}
            layout:
              title:
                text: Gauge Indicator<br><sub>Progress Towards a Target</sub>
        ```

    === "Delta Indicator with Comparison"

        This example demonstrates an `indicator` plot with delta values, comparing the current value to a previous value:

        ![](../../assets/example-charts/props/indicator/delta-indicator.png)

        Here's the code:

        ```yaml
        models:
          - name: indicator-data-delta
            args:
              - echo
              - |
                sort,value
                3,85
                2,75
                1,65
                0,55
        traces:
          - name: Delta Indicator with Comparison
            model: ${ref(indicator-data-delta)}
            columns: 
              val: value 
            props:
              type: indicator
              mode: "number+delta"
              value: column(val)[0]
              delta:
                reference: column(val)[1]
            order_by: 
              - ?{sort desc}
        charts:
          - name: Delta Indicator with Comparison Chart
            traces:
              - ${ref(Delta Indicator with Comparison)}
            layout:
              title:
                text: Delta Indicator with Comparison<br><sub>Showing Change from Previous Value</sub>
        ```

{% endraw %}
<!--end-->