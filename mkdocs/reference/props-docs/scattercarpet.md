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

        This example shows a `scattercarpet` plot with a visible carpet grid. The carpet trace defines the non-linear grid, and the scattercarpet trace plots points on that grid:

        ```yaml
        models:
          - name: carpet-grid
            args:
              - echo
              - |
                a,b,y
                4,1,2
                4,2,3.5
                4,3,4
                4.5,1,3
                4.5,2,4.5
                4.5,3,5
                5,1,5.5
                5,2,6.5
                5,3,7.5
                6,1,8
                6,2,8.5
                6,3,10
          - name: scattercarpet-data
            args:
              - echo
              - |
                a,b,value
                4,1.5,15
                4.5,2.5,25
                5,1.5,30
                6,2.5,40
        traces:
          - name: Carpet Grid
            model: ${ref(carpet-grid)}
            props:
              type: carpet
              a: ?{a}
              b: ?{b}
              y: ?{y}
              aaxis:
                tickprefix: 'a = '
                ticksuffix: 'm'
                smoothing: 1
                minorgridcount: 9
              baxis:
                tickprefix: 'b = '
                ticksuffix: 'Pa'
                smoothing: 1
                minorgridcount: 9
          - name: Simple Scattercarpet Plot
            model: ${ref(scattercarpet-data)}
            props:
              type: scattercarpet
              a: ?{a}
              b: ?{b}
              mode: "markers"
        charts:
          - name: Simple Scattercarpet Chart
            traces:
              - ${ref(Carpet Grid)}
              - ${ref(Simple Scattercarpet Plot)}
            layout:
              title:
                text: Simple Scattercarpet Plot<br><sub>2D Data Points on Carpet Axis</sub>
        ```

    === "Scattercarpet Plot with Lines"

        This example shows a `scattercarpet` plot with lines+markers, using a unique carpet grid for context:

        ```yaml
        models:
          - name: carpet-grid-lines
            args:
              - echo
              - |
                a,b,y
                4,1,2
                4,2,3.5
                4,3,4
                4.5,1,3
                4.5,2,4.5
                4.5,3,5
                5,1,5.5
                5,2,6.5
                5,3,7.5
                6,1,8
                6,2,8.5
                6,3,10
          - name: scattercarpet-data-lines
            args:
              - echo
              - |
                a,b,value
                4,1,7
                4.5,2,12
                5,1.5,10
                6,2.5,18
                5,2,17
        traces:
          - name: Carpet Grid Lines
            model: ${ref(carpet-grid-lines)}
            props:
              type: carpet
              a: ?{a}
              b: ?{b}
              y: ?{y}
              aaxis:
                tickprefix: 'a = '
                ticksuffix: 'm'
                smoothing: 1
                minorgridcount: 9
              baxis:
                tickprefix: 'b = '
                ticksuffix: 'Pa'
                smoothing: 1
                minorgridcount: 9
          - name: Scattercarpet Plot with Lines
            model: ${ref(scattercarpet-data-lines)}
            props:
              type: scattercarpet
              a: ?{a}
              b: ?{b}
              mode: "lines+markers"
        charts:
          - name: Scattercarpet Chart with Lines
            traces:
              - ${ref(Carpet Grid Lines)}
              - ${ref(Scattercarpet Plot with Lines)}
            layout:
              title:
                text: Scattercarpet Plot with Lines<br><sub>Connecting Data Points on Carpet Axis</sub>
        ```

    === "Scattercarpet Plot with Custom Marker Sizes and Colors"

        This example shows a `scattercarpet` plot with custom marker sizes and colors, using a unique carpet grid for context:

        ```yaml
        models:
          - name: carpet-grid-markers
            args:
              - echo
              - |
                a,b,y
                4,1,2
                4,2,3.5
                4,3,4
                4.5,1,3
                4.5,2,4.5
                4.5,3,5
                5,1,5.5
                5,2,6.5
                5,3,7.5
                6,1,8
                6,2,8.5
                6,3,10
          - name: scattercarpet-data-custom
            args:
              - echo
              - |
                a,b,size,color
                4,1,10,#1f77b4
                4.5,2,15,#ff7f0e
                5,1.5,20,#2ca02c
                6,2.5,25,#d62728
                5,2,30,#9467bd
        traces:
          - name: Carpet Grid Markers
            model: ${ref(carpet-grid-markers)}
            props:
              type: carpet
              a: ?{a}
              b: ?{b}
              y: ?{y}
              aaxis:
                tickprefix: 'a = '
                ticksuffix: 'm'
                smoothing: 1
                minorgridcount: 9
              baxis:
                tickprefix: 'b = '
                ticksuffix: 'Pa'
                smoothing: 1
                minorgridcount: 9
          - name: Scattercarpet Plot with Custom Markers
            model: ${ref(scattercarpet-data-custom)}
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
              - ${ref(Carpet Grid Markers)}
              - ${ref(Scattercarpet Plot with Custom Markers)}
            layout:
              title:
                text: Scattercarpet Plot with Custom Markers<br><sub>Custom Sizes and Colors for Carpet Axis Data Points</sub>
        ```
{% endraw %}
<!--end-->