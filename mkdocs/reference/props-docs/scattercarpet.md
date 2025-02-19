---
search:
  exclude: true
---
<!--start-->
## Overview

The `scattercarpet` trace type is used to create scatter plots on a 2D carpet axis, which allows for more complex and non-linear grids. This trace type is useful for visualizing relationships between variables when the x and y axes are not evenly spaced, such as in polar or distortion grids.

You can customize the marker size, color, and line connections, similar to standard scatter plots but on a carpet axis.

!!! tip "Common Uses"
    - **Non-Linear Grids**: Visualizing data points on non-standard grids where the x and y axes are distorted or uneven.
    - **Data Visualization with Carpet Axes**: Displaying data points in cases where the relationships between variables are non-linear or require a more flexible grid.
    - **Heatmap-Like Data**: Scatter plots combined with other traces like `carpet` for advanced visualizations.

_**Check out the [Attributes](../configuration/Trace/Props/Scattercarpet/#attributes) for the full set of configuration options**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple Scattercarpet Plot"

        Here's a simple `scattercarpet` plot visualizing data points on a carpet axis:

        ![](../../assets/example-charts/props/scattercarpet/simple-scattercarpet.png)

        You can copy this code below to create this chart in your project:

        ```yaml
        models:
          - name: scattercarpet-data
            args:
              - echo
              - |
                a,b,value
                1,10,15
                2,20,25
                3,15,30
                4,25,35
                5,30,40
        traces:
          - name: Simple Scattercarpet Plot
            model: ref(scattercarpet-data)
            props:
              type: scattercarpet
              a: ?{a}
              b: ?{b}
              mode: "markers"
        charts:
          - name: Simple Scattercarpet Chart
            traces:
              - ref(Simple Scattercarpet Plot)
            layout:
              title:
                text: Simple Scattercarpet Plot<br><sub>2D Data Points on Carpet Axis</sub>
        ```

    === "Scattercarpet Plot with Lines"

        This example demonstrates a `scattercarpet` plot with lines connecting the data points on a carpet axis:

        ![](../../assets/example-charts/props/scattercarpet/lines-scattercarpet.png)

        Here's the code:

        ```yaml
        models:
          - name: scattercarpet-data-lines
            args:
              - echo
              - |
                a,b,value
                1,5,7
                2,10,12
                3,8,10
                4,15,18
                5,12,17
        traces:
          - name: Scattercarpet Plot with Lines
            model: ref(scattercarpet-data-lines)
            props:
              type: scattercarpet
              a: ?{a}
              b: ?{b}
              mode: "lines+markers"
        charts:
          - name: Scattercarpet Chart with Lines
            traces:
              - ref(Scattercarpet Plot with Lines)
            layout:
              title:
                text: Scattercarpet Plot with Lines<br><sub>Connecting Data Points on Carpet Axis</sub>
        ```

    === "Scattercarpet Plot with Custom Marker Sizes and Colors"

        Here's a `scattercarpet` plot with custom marker sizes and colors, giving more visual weight to each data point on a carpet axis:

        ![](../../assets/example-charts/props/scattercarpet/custom-markers-scattercarpet.png)

        Here's the code:

        ```yaml
        models:
          - name: scattercarpet-data-custom
            args:
              - echo
              - |
                a,b,size,color
                1,5,10,#1f77b4
                2,10,15,#ff7f0e
                3,8,20,#2ca02c
                4,15,25,#d62728
                5,12,30,#9467bd
        traces:
          - name: Scattercarpet Plot with Custom Markers
            model: ref(scattercarpet-data-custom)
            props:
              type: scattercarpet
              a: ?{a}
              b: ?{b}
              mode: "markers"
              marker:
                size: ?{size}
                color: ?{color}
        charts:
          - name: Scattercarpet Chart with Custom Markers
            traces:
              - ref(Scattercarpet Plot with Custom Markers)
            layout:
              title:
                text: Scattercarpet Plot with Custom Markers<br><sub>Custom Sizes and Colors for Carpet Axis Data Points</sub>
        ```

{% endraw %}
<!--end-->