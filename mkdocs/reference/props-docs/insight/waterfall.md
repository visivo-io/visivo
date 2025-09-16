---
search:
  exclude: true
---

<!--start-->

## Overview

The `waterfall` insight type is used to create waterfall charts, which visualize incremental changes in value across a series of categories or time. Waterfall insights are ideal for financial analysis and showing sequential positive or negative changes affecting an initial value.

You can customize colors, connectors, and base values to represent your data effectively.

!!! tip "Common Uses" - **Financial Analysis**: Visualizing profit and loss over time or across categories. - **Incremental Changes**: Showing how individual positive or negative changes affect a starting value. - **Part-to-Whole Visualization**: Highlighting how parts contribute to a cumulative total.

_**Check out the [Attributes](../../configuration/Insight/Props/Waterfall/#attributes) for the full set of configuration options**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple Waterfall Insight"

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

        insights:
          - name: Simple Waterfall Insight
            model: ${ref(waterfall-data)}
            columns:
              idx: ?{idx}
              label: ?{label}
              value: ?{value}
            props:
              type: waterfall
              x: ?{columns.label}
              y: ?{columns.value}
              measure: ["initial", "relative", "relative", "relative", "total"]
            order_by:
              - ?{columns.idx asc}

        charts:
          - name: Simple Waterfall Chart
            insights:
              - ${ref(Simple Waterfall Insight)}
            layout:
              title:
                text: Simple Waterfall Plot<br><sub>Sequential Changes in Value</sub>
        ```

    === "Waterfall Insight with Custom Colors"

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

        insights:
          - name: Waterfall Insight with Custom Colors
            model: ${ref(waterfall-data-colors)}
            columns:
              idx: ?{idx}
              label: ?{label}
              value: ?{value}
            props:
              type: waterfall
              x: ?{columns.label}
              y: ?{columns.value}
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
              - ?{columns.idx asc}

        charts:
          - name: Waterfall Chart with Custom Colors
            insights:
              - ${ref(Waterfall Insight with Custom Colors)}
            layout:
              title:
                text: Waterfall Plot with Custom Colors<br><sub>Customized Coloring for Categories</sub>
        ```

    === "Financial Waterfall Insight with Connectors"

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

        insights:
          - name: Financial Waterfall Insight
            model: ${ref(waterfall-data-connectors)}
            columns:
              idx: ?{idx}
              quarter: ?{quarter}
              half: ?{half}
              value: ?{value}
              mode: ?{mode}
            props:
              type: waterfall
              x:
                - ?{columns.half}
                - ?{columns.quarter}
              y: ?{columns.value}
              measure: ?{columns.mode}
              hovertemplate: "%{x}: %{y:$.2f}"
              texttemplate: "%{delta:$.2f}"
              textposition: "outside"
              connector:
                line:
                  color: "orange"
                  width: 5
            order_by:
              - ?{columns.idx asc}

        charts:
          - name: Financial Waterfall Chart
            insights:
              - ${ref(Financial Waterfall Insight)}
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
