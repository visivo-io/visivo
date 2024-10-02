
## Overview

The `contour` trace type is used to create contour plots, which are useful for visualizing three-dimensional data in two dimensions. Contour plots are often used to represent things like elevation, temperature, or pressure distributions. The trace uses a matrix of Z values and optional X and Y coordinates to create a continuous representation of the data.

Contour traces allow you to customize line colors, fill colors, and the number of contour levels to highlight data variation.

!!! tip "Common Uses"
    - **Topographic Maps**: Visualizing elevation levels across a geographic area.
    - **Heat or Temperature Maps**: Displaying temperature distributions over a surface.
    - **Electromagnetic Fields**: Representing the strength of a field at various points.
    - **Pressure Levels**: Visualizing pressure across different areas in meteorology.

_**Check out the [Attributes](../configuration/Trace/Props/Contour/#attributes) for the full set of configuration options**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple Contour Plot"

        Here's a simple `contour` plot showing a basic grid of Z values, where X and Y represent spatial data:

        ![](../../assets/example-charts/props/contour/simple-contour.png)

        You can copy this code below to create this chart in your project:

        ```yaml
        models:
          - name: contour-data
            args:
              - echo
              - |
                x,y,z
                1,1,10
                2,1,15
                3,1,20
                1,2,5
                2,2,10
                3,2,15
                1,3,0
                2,3,5
                3,3,10
        traces:
          - name: Simple Contour Plot
            model: ref(contour-data)
            props:
              type: contour
              x: query(x)
              y: query(y)
              z: query(z)
              colorscale: "Viridis"
        charts:
          - name: Simple Contour Chart
            traces:
              - ref(Simple Contour Plot)
            layout:
              title:
                text: Simple Contour Plot<br><sub>Contour Plot Based on Z Values</sub>
              xaxis:
                title:
                  text: "X Axis"
              yaxis:
                title:
                  text: "Y Axis"
        ```

    === "Filled Contour Plot"

        This example shows a contour plot with filled contours, where each level is shaded with a different color:

        ![](../../assets/example-charts/props/contour/filled-contour.png)

        Here's the code:

        ```yaml
        models:
          - name: contour-data-filled
            args:
              - echo
              - |
                x,y,z
                0,0,10
                1,0,15
                2,0,20
                0,1,5
                1,1,10
                2,1,15
                0,2,0
                1,2,5
                2,2,10
        traces:
          - name: Filled Contour Plot
            model: ref(contour-data-filled)
            props:
              type: contour
              x: query(x)
              y: query(y)
              z: query(z)
              colorscale: "Earth"
              contours:
                coloring: "heatmap"
                showlines: true
        charts:
          - name: Filled Contour Chart
            traces:
              - ref(Filled Contour Plot)
            layout:
              title:
                text: Filled Contour Plot<br><sub>Contour Plot with Filled Levels</sub>
              xaxis:
                title:
                  text: "X Axis"
              yaxis:
                title:
                  text: "Y Axis"
        ```

    === "Contour Plot with Multiple Levels"

        This example demonstrates how to customize the contour levels by specifying a set number of levels:

        ![](../../assets/example-charts/props/contour/multi-level-contour.png)

        Here's the code:

        ```yaml
        models:
          - name: contour-data-multi
            args:
              - echo
              - |
                x,y,z
                -2,-2,0
                -1,-2,1
                0,-2,2
                1,-2,3
                2,-2,4
                -2,-1,1
                -1,-1,2
                0,-1,3
                1,-1,4
                2,-1,5
                -2,0,2
                -1,0,3
                0,0,4
                1,0,5
                2,0,6
        traces:
          - name: Contour Plot with Multiple Levels
            model: ref(contour-data-multi)
            props:
              type: contour
              x: query(x)
              y: query(y)
              z: query(z)
              colorscale: "Jet"
              contours:
                start: 0
                end: 6
                size: 1
        charts:
          - name: Contour Chart with Multiple Levels
            traces:
              - ref(Contour Plot with Multiple Levels)
            layout:
              title:
                text: Contour Plot with Multiple Levels<br><sub>Custom Contour Levels</sub>
              xaxis:
                title:
                  text: "X Axis"
              yaxis:
                title:
                  text: "Y Axis"
        ```

{% endraw %}
