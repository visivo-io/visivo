---
search:
  exclude: true
---
<!--start-->
## Overview

The `scatterternary` trace type is used to create scatter plots on ternary plots, which are used for visualizing proportions that sum to a constant, such as in chemistry or economics where three components are involved. Ternary plots are useful for showing the relationship between three variables that are interdependent.

You can customize the marker size, color, and lines to connect points, similar to scatter plots but within a ternary plot.

!!! tip "Common Uses"
    - **Proportional Data Visualization**: Visualizing data that involves proportions of three components.
    - **Ternary Relationship Analysis**: Exploring how three components relate to one another.
    - **Chemistry and Economics**: Commonly used in fields like chemistry, soil science, and economics for visualizing compositional data.

_**Check out the [Attributes](../configuration/Trace/Props/Scatterternary/#attributes) for the full set of configuration options**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple Scatterternary Plot"

        Here's a simple `scatterternary` plot showing data points on a ternary plot:

        ![](../../assets/example-charts/props/scatterternary/simple-scatterternary.png)

        You can copy this code below to create this chart in your project:

        ```yaml
        models:
          - name: scatterternary-data
            args:
              - echo
              - |
                a,b,c
                0.1,0.5,0.4
                0.3,0.4,0.3
                0.5,0.3,0.2
                0.7,0.2,0.1
        traces:
          - name: Simple Scatterternary Plot
            model: ref(scatterternary-data)
            props:
              type: scatterternary
              a: query(a)
              b: query(b)
              c: query(c)
              mode: "markers"
        charts:
          - name: Simple Scatterternary Chart
            traces:
              - ref(Simple Scatterternary Plot)
            layout:
              title:
                text: Simple Scatterternary Plot<br><sub>Data Points on a Ternary Plot</sub>
        ```

    === "Scatterternary Plot with Lines"

        This example demonstrates a `scatterternary` plot with lines connecting the data points on a ternary plot:

        ![](../../assets/example-charts/props/scatterternary/lines-scatterternary.png)

        Here's the code:

        ```yaml
        models:
          - name: scatterternary-data-lines
            args:
              - echo
              - |
                a,b,c
                0.2,0.6,0.2
                0.4,0.3,0.3
                0.6,0.2,0.2
                0.8,0.1,0.1
        traces:
          - name: Scatterternary Plot with Lines
            model: ref(scatterternary-data-lines)
            props:
              type: scatterternary
              a: query(a)
              b: query(b)
              c: query(c)
              mode: "lines+markers"
        charts:
          - name: Scatterternary Chart with Lines
            traces:
              - ref(Scatterternary Plot with Lines)
            layout:
              title:
                text: Scatterternary Plot with Lines<br><sub>Connecting Data Points on a Ternary Plot</sub>
        ```

    === "Scatterternary Plot with Custom Marker Sizes and Colors"

        Here's a `scatterternary` plot with custom marker sizes and colors, giving more visual weight to each data point on a ternary plot:

        ![](../../assets/example-charts/props/scatterternary/custom-markers-scatterternary.png)

        Here's the code:

        ```yaml
        models:
          - name: scatterternary-data-custom
            args:
              - echo
              - |
                a,b,c,size,color
                0.1,0.5,0.4,10,#1f77b4
                0.3,0.4,0.3,15,#ff7f0e
                0.5,0.3,0.2,20,#2ca02c
                0.7,0.2,0.1,25,#d62728
        traces:
          - name: Scatterternary Plot with Custom Markers
            model: ref(scatterternary-data-custom)
            props:
              type: scatterternary
              a: query(a)
              b: query(b)
              c: query(c)
              mode: "markers"
              marker:
                size: query(size)
                color: query(color)
        charts:
          - name: Scatterternary Chart with Custom Markers
            traces:
              - ref(Scatterternary Plot with Custom Markers)
            layout:
              title:
                text: Scatterternary Plot with Custom Markers<br><sub>Custom Sizes and Colors for Ternary Data Points</sub>
        ```

{% endraw %}
<!--end-->