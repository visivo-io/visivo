---
search:
  exclude: true
---

<!--start-->

## Overview

The `funnelarea` insight type is used to create funnel area charts, which are similar to funnel charts but are represented as a circular area instead of a linear progression. Funnel area charts are useful for comparing stages in a process with proportional sizes. Each stage is represented as a sector of a circle, and its size represents the magnitude of the data.

You can control the colors, labels, and orientation of the funnel area sections to visualize proportional data across different stages.

!!! tip "Common Uses" - **Proportional Stages**: Showing the proportion of data at each stage in a circular format. - **Conversion Rates**: Visualizing the drop-off rates in different stages of a process. - **Sales and Marketing Funnels**: Representing funnels like leads-to-sales in a circular format.

_**Check out the [Attributes](../configuration/Insight/Props/Funnelarea/#attributes) for the full set of configuration options**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple Funnelarea Insight"

        Here's a simple `funnelarea` insight showing data in a circular funnel format:

        ![](../../assets/example-charts/props/funnelarea/simple-funnelarea.png)

        ```yaml
        models:
          - name: funnelarea-data
            args:
              - echo
              - |
                stage,value
                Leads,1000
                Qualified Leads,750
                Opportunities,400
                Proposals,200
                Closed Deals,100
        insights:
          - name: Simple Funnelarea Insight
            model: ${ref(funnelarea-data)}
            columns:
              stage: ?{ stage }
              value: ?{ value }
            props:
              type: funnelarea
              labels: ?{columns.stage}
              values: ?{columns.value}
        charts:
          - name: Simple Funnelarea Chart
            insights:
              - ${ref(Simple Funnelarea Insight)}
            layout:
              title:
                text: Simple Funnelarea Chart<br><sub>Proportional Sales Funnel</sub>
        ```

    === "Funnelarea with Custom Colors"

        This example shows a `funnelarea` insight where each stage has a custom color for better differentiation:

        ![](../../assets/example-charts/props/funnelarea/custom-colors-funnelarea.png)

        ```yaml
        models:
          - name: funnelarea-data-custom
            args:
              - echo
              - |
                stage,value,color
                Awareness,5000,"#1f77b4"
                Interest,3000,"#ff7f0e"
                Consideration,1500,"#2ca02c"
                Decision,700,"#d62728"
                Purchase,300,"#9467bd"
        insights:
          - name: Custom Colors Funnelarea Insight
            model: ${ref(funnelarea-data-custom)}
            columns:
              stage: ?{ stage }
              value: ?{ value }
              color: ?{ color }
            props:
              type: funnelarea
              labels: ?{columns.stage}
              values: ?{columns.value}
              marker:
                colors: ?{columns.color}
        charts:
          - name: Funnelarea Chart with Custom Colors
            insights:
              - ${ref(Custom Colors Funnelarea Insight)}
            layout:
              title:
                text: Funnelarea Chart with Custom Colors<br><sub>User Journey</sub>
        ```

    === "Funnelarea with Hover Info"

        This example demonstrates a `funnelarea` insight with hover information to show the value and percentage for each stage:

        ![](../../assets/example-charts/props/funnelarea/funnelarea-hover.png)

        ```yaml
        models:
          - name: funnelarea-data-hover
            args:
              - echo
              - |
                stage,value
                Leads,1000
                Opportunities,500
                Proposals,250
                Won,100
        insights:
          - name: Funnelarea Insight with Hover Info
            model: ${ref(funnelarea-data-hover)}
            columns:
              stage: ?{ stage }
              value: ?{ value }
            props:
              type: funnelarea
              labels: ?{columns.stage}
              values: ?{columns.value}
              hoverinfo: "label+value+percent"
        charts:
          - name: Funnelarea Chart with Hover Info
            insights:
              - ${ref(Funnelarea Insight with Hover Info)}
            layout:
              title:
                text: Funnelarea Chart with Hover Info<br><sub>Sales Funnel with Hover Details</sub>
        ```

{% endraw %}

<!--end-->
