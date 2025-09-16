---
search:
  exclude: true
---

<!--start-->

## Overview

The `contour` insight type is used to create contour plots, which display three-dimensional data in a two-dimensional format. Contour plots are particularly useful for representing surfaces such as elevation, temperature, pressure, or intensity distributions.

They use a grid of **Z values** (with optional X and Y coordinates) to generate continuous contour lines or filled regions, allowing you to easily visualize gradients and variations across a surface.

!!! tip "Common Uses"

- **Topographic Maps**: Visualizing elevation across a landscape.
- **Heat/Temperature Maps**: Showing temperature gradients over an area.
- **Electromagnetic Fields**: Representing varying field strengths.
- **Pressure Maps**: Displaying pressure levels in meteorology.

_**See the [Attributes](../configuration/Insight/Props/Contour/#attributes) for the full list of configuration options.**_

---

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple Contour Insight"

        A basic contour insight using X, Y, and Z values:

        ![](../../assets/example-charts/props/contour/simple-contour.png)

        ```yaml
        insights:
          - name: Simple Contour Insight
            description: "Basic contour plot using X, Y, Z"
            model: ${ref(contour-data)}
            columns:
              x: ?{x}
              y: ?{y}
              z: ?{z}
            props:
              type: contour
              x: ?{columns.x}
              y: ?{columns.y}
              z: ?{columns.z}
              colorscale: "Viridis"
              ncontours: 20
            layout:
              title:
                text: Simple Contour Plot<br><sub>Based on Z Values</sub>
              xaxis:
                title: "X Axis"
              yaxis:
                title: "Y Axis"
        ```

    === "Filled Contour Insight"

        Adds filled color regions between contour lines for better gradient visualization:

        ![](../../assets/example-charts/props/contour/filled-contour.png)

        ```yaml
        insights:
          - name: Filled Contour Insight
            description: "Contour plot with heatmap coloring"
            model: ${ref(contour-data-filled)}
            columns:
              x: ?{x}
              y: ?{y}
              z: ?{z}
            props:
              type: contour
              x: ?{columns.x}
              y: ?{columns.y}
              z: ?{columns.z}
              colorscale: "Earth"
              contours:
                coloring: "heatmap"
                showlines: true
              ncontours: 25
            layout:
              title:
                text: Filled Contour Plot<br><sub>Shaded Levels</sub>
              xaxis:
                title: "X Axis"
              yaxis:
                title: "Y Axis"
        ```

    === "Custom Levels"

        Demonstrates manual control over contour ranges and intervals:

        ![](../../assets/example-charts/props/contour/multi-level-contour.png)

        ```yaml
        insights:
          - name: Multi-Level Contour Insight
            description: "Contour plot with custom contour levels"
            model: ${ref(contour-data-multi)}
            columns:
              x: ?{x}
              y: ?{y}
              z: ?{z}
            props:
              type: contour
              x: ?{columns.x}
              y: ?{columns.y}
              z: ?{columns.z}
              colorscale: "Jet"
              contours:
                start: 0
                end: 12
                size: 0.5
              ncontours: 24
            layout:
              title:
                text: Contour Plot with Custom Levels
              xaxis:
                title: "X Axis"
              yaxis:
                title: "Y Axis"
        ```

{% endraw %}

<!--end-->
