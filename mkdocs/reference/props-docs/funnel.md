
## Overview

The `funnel` trace type is used to create funnel charts, which visualize data across stages in a process. Funnel charts are often used in sales or marketing to show how data decreases as it passes through each stage (e.g., from leads to closed deals).

You can control the orientation, marker styles, and colors to better represent your data flow. Funnel charts help in identifying bottlenecks or drop-off points in a process.

!!! tip "Common Uses"
    - **Sales Funnels**: Tracking the stages from lead generation to closing a deal.
    - **Conversion Funnels**: Visualizing the steps in a user journey and where drop-offs occur.
    - **Progression Through Stages**: Representing data at different stages of a sequential process.

_**Check out the [Attributes](../configuration/Trace/Props/Funnel/#attributes) for the full set of configuration options**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple Funnel Plot"

        Here's a simple `funnel` chart showing data as it moves through various stages:

        ![](../../assets/example-charts/props/funnel/simple-funnel.png)

        You can copy this code below to create this chart in your project:

        ```yaml
        models:
          - name: funnel-data
            args:
              - echo
              - |
                stage,value
                Leads,1000
                Qualified Leads,750
                Opportunities,400
                Proposals,200
                Closed Deals,100
        traces:
          - name: Simple Funnel Plot
            model: ref(funnel-data)
            props:
              type: funnel
              x: query(stage)
              y: query(value)
              textinfo: "value+percent previous"
              marker:
                color: "#17becf"
        charts:
          - name: Simple Funnel Chart
            traces:
              - ref(Simple Funnel Plot)
            layout:
              title:
                text: Simple Funnel Chart<br><sub>Sales Funnel from Leads to Closed Deals</sub>
              xaxis:
                title:
                  text: "Stage"
              yaxis:
                title:
                  text: "Count"
        ```

    === "Horizontal Funnel Chart"

        This example demonstrates a horizontal funnel chart, with stages represented along the y-axis:

        ![](../../assets/example-charts/props/funnel/horizontal-funnel.png)

        Here's the code:

        ```yaml
        models:
          - name: funnel-data-horizontal
            args:
              - echo
              - |
                stage,value
                Awareness,5000
                Interest,3000
                Consideration,1500
                Conversion,700
        traces:
          - name: Horizontal Funnel Chart
            model: ref(funnel-data-horizontal)
            props:
              type: funnel
              orientation: h
              y: query(stage)
              x: query(value)
              marker:
                color: "#ff7f0e"
        charts:
          - name: Horizontal Funnel Chart
            traces:
              - ref(Horizontal Funnel Chart)
            layout:
              title:
                text: Horizontal Funnel Chart<br><sub>Stages of User Journey</sub>
              xaxis:
                title:
                  text: "Users"
              yaxis:
                title:
                  text: "Stage"
        ```

    === "Funnel Chart with Custom Markers"

        Here's a funnel chart where each stage has a different color to highlight distinct phases in the process:

        ![](../../assets/example-charts/props/funnel/custom-markers-funnel.png)

        You can copy this code below to create this chart in your project:

        ```yaml
        models:
          - name: funnel-data-custom
            args:
              - echo
              - |
                stage,value,color
                Leads,1200,"#1f77b4"
                MQL,900,"#ff7f0e"
                SQL,600,"#2ca02c"
                Proposal,300,"#d62728"
                Won,100,"#9467bd"
        traces:
          - name: Custom Markers Funnel Chart
            model: ref(funnel-data-custom)
            props:
              type: funnel
              x: query(stage)
              y: query(value)
              marker:
                color: query(color)
              textinfo: "value+percent total"
        charts:
          - name: Funnel Chart with Custom Markers
            traces:
              - ref(Custom Markers Funnel Chart)
            layout:
              title:
                text: Funnel Chart with Custom Markers<br><sub>Stages of the Sales Funnel</sub>
              xaxis:
                title:
                  text: "Stage"
              yaxis:
                title:
                  text: "Count"
        ```

{% endraw %}
