---
search:
  exclude: true
---
<!--start-->
## Overview

The `waterfall` trace type is used to create waterfall charts, which are useful for visualizing incremental changes in value over a series of categories or time. Waterfall charts are commonly used in financial and analytical contexts to show how sequential positive or negative values affect an initial value.

You can customize the colors, connectors, and base values to represent your data effectively.

!!! tip "Common Uses"
    - **Financial Analysis**: Visualizing profit and loss over time or across categories.
    - **Incremental Changes**: Showing how individual positive or negative changes affect a starting value.
    - **Part-to-Whole Visualization**: Highlighting how parts contribute to a cumulative total.

_**Check out the [Attributes](../configuration/Trace/Props/Waterfall/#attributes) for the full set of configuration options**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple Waterfall Plot"

        Here's a simple `waterfall` plot showing incremental changes across categories:

        ![](../../assets/example-charts/props/waterfall/simple-waterfall.png)

        You can copy this code below to create this chart in your project:

        ```yaml
        models:
          - name: waterfall-data
            args:
              - echo
              - |
                idx,label,value
                0,Starting,1000
                1,Increase A,200
                2,Decrease B,-150
                3,Increase C,300
                4,Ending,1350
        traces:
          - name: Simple Waterfall Plot
            model: ${ref(waterfall-data)}
            props:
              type: waterfall
              x: ?{label}
              y: ?{value}
              measure: ["initial", "relative", "relative", "relative", "total"]
            order_by: 
              - ?{ idx asc}
        charts:
          - name: Simple Waterfall Chart
            traces:
              - ${ref(Simple Waterfall Plot)}
            layout:
              title:
                text: Simple Waterfall Plot<br><sub>Sequential Changes in Value</sub>
        ```

    === "Waterfall Plot with Custom Colors"

        This example demonstrates a `waterfall` plot where the bars have custom colors for different categories:

        ![](../../assets/example-charts/props/waterfall/custom-colors-waterfall.png)

        Here's the code:

        ```yaml
        models:
          - name: waterfall-data-colors
            args:
              - echo
              - |
                idx,label,value,color
                0,Starting,1000,#1f77b4
                1,Increase A,200,#2ca02c
                2,Decrease B,-150,#d62728
                3,Increase C,300,#ff7f0e
                4,Ending,1350,#9467bd
        traces:
          - name: Waterfall Plot with Custom Colors
            model: ${ref(waterfall-data-colors)}
            props:
              type: waterfall
              x: ?{label}
              y: ?{value}
              measure: ["initial", "relative", "relative", "relative", "total"]
              increasing:
                marker: 
                  color: 'orange'
              decreasing: 
                marker: 
                  color: 'purple'
              totals: 
                marker: 
                  color: 'grey'
                  line: 
                    color: 'orange'
                    width: 4
            order_by: 
              - ?{ idx asc}
        charts:
          - name: Waterfall Chart with Custom Colors
            traces:
              - ${ref(Waterfall Plot with Custom Colors)}
            layout:
              title:
                text: Waterfall Plot with Custom Colors<br><sub>Customized Coloring for Categories</sub>
        ```

    === "Financial Waterfall Plot"

        Here's a `waterfall` plot demonstrating a financial use case with connectors and custom formatting:

        ![](../../assets/example-charts/props/waterfall/financial-waterfall.png)

        Here's the code:

        ```yaml
        models:
          - name: waterfall-data-connectors
            args:
              - echo
              - |
                idx,quarter,half,value,mode
                0,Q1,H1,1000,initial
                1,Q2,H1,200,relative
                2,Gross Profit,H1 Summary,0,total
                3,Q3,H2,-150,relative
                4,Q4,H2,300,relative
                5,Gross Profit,FY2024,0,total
        traces:
          - name: Waterfall Plot with Connectors
            model: ${ref(waterfall-data-connectors)}
            props:
              type: waterfall
              x: 
                - ?{half}
                - ?{quarter}
              y: ?{value}
              measure: ?{mode}
              hovertemplate: "%{x}: %{y:$.2f}"
              texttemplate: "%{delta:$.2f}"
              textposition: "outside"
              connector:
                line:
                  color: "orange"
                  width: 5
            order_by: 
              - ?{ idx asc}
        charts:
          - name: Waterfall Chart with Connectors
            traces:
              - ${ref(Waterfall Plot with Connectors)}
            layout:
              title:
                text: Financial Waterfall
              margin: 
                b: 50
                t: 60
              yaxis:
                range: [0, 1600]
                tickprefix: '$'
                title: 
                  text: "Millions ($)"
        ```

{% endraw %}
<!--end-->