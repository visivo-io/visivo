---
search:
  exclude: true
---

<!--start-->

## Overview

The `scattercarpet` insight type is used to create scatter plots on a 2D carpet axis, which allows for more complex and non-linear grids. This type is useful for visualizing relationships between variables when the x and y axes are not evenly spaced, such as in polar or distortion grids.

You can customize the marker size, color, and line connections, similar to standard scatter plots but on a carpet axis.

!!! tip "Common Uses" - **Non-Linear Grids**: Visualizing data points on non-standard grids where the x and y axes are distorted or uneven. - **Data Visualization with Carpet Axes**: Displaying data points in cases where the relationships between variables are non-linear or require a more flexible grid. - **Heatmap-Like Data**: Scatter plots combined with other insights like `carpet` for advanced visualizations.

_**Check out the [Attributes](../../configuration/Insight/Props/Scattercarpet/#attributes) for the full set of configuration options**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple Scattercarpet Plot"

        This example shows a `scattercarpet` insight with a visible carpet grid:

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

        insights:
          - name: Carpet Grid
            props:
              type: carpet
              a: ?{${ref(carpet-grid).a}}
              b: ?{${ref(carpet-grid).b}}
              y: ?{${ref(carpet-grid).y}}
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
            props:
              type: scattercarpet
              a: ?{${ref(scattercarpet-data).a}}
              b: ?{${ref(scattercarpet-data).b}}
              mode: "markers"

        charts:
          - name: Simple Scattercarpet Chart
            insights:
              - ${ref(Carpet Grid)}
              - ${ref(Simple Scattercarpet Plot)}
            layout:
              title:
                text: Simple Scattercarpet Plot<br><sub>2D Data Points on Carpet Axis</sub>
        ```

    === "Scattercarpet Plot with Lines"

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

        insights:
          - name: Carpet Grid Lines
            props:
              type: carpet
              a: ?{${ref(carpet-grid-lines).a}}
              b: ?{${ref(carpet-grid-lines).b}}
              y: ?{${ref(carpet-grid-lines).y}}

          - name: Scattercarpet Plot with Lines
            props:
              type: scattercarpet
              a: ?{${ref(scattercarpet-data-lines).a}}
              b: ?{${ref(scattercarpet-data-lines).b}}
              mode: "lines+markers"

        charts:
          - name: Scattercarpet Chart with Lines
            insights:
              - ${ref(Carpet Grid Lines)}
              - ${ref(Scattercarpet Plot with Lines)}
            layout:
              title:
                text: Scattercarpet Plot with Lines<br><sub>Connecting Data Points on Carpet Axis</sub>
        ```

    === "Scattercarpet Plot with Custom Marker Sizes and Colors"

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

        insights:
          - name: Carpet Grid Markers
            props:
              type: carpet
              a: ?{${ref(carpet-grid-markers).a}}
              b: ?{${ref(carpet-grid-markers).b}}
              y: ?{${ref(carpet-grid-markers).y}}

          - name: Scattercarpet Plot with Custom Markers
            props:
              type: scattercarpet
              a: ?{${ref(scattercarpet-data-custom).a}}
              b: ?{${ref(scattercarpet-data-custom).b}}
              mode: "markers"
              marker:
                size: ?{${ref(scattercarpet-data-custom).size}}
                color: ?{${ref(scattercarpet-data-custom).color}}

        charts:
          - name: Scattercarpet Chart with Custom Markers
            insights:
              - ${ref(Carpet Grid Markers)}
              - ${ref(Scattercarpet Plot with Custom Markers)}
            layout:
              title:
                text: Scattercarpet Plot with Custom Markers<br><sub>Custom Sizes and Colors for Carpet Axis Data Points</sub>
        ```

{% endraw %}

<!--end-->
