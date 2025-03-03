---
search:
  exclude: true
---
<!--start-->
## Overview

The `surface` trace type is used to create 3D surface plots, which visualize 3D data on a continuous surface. Surface plots are ideal for visualizing the relationship between three variables, often showing the interaction of two independent variables on a dependent variable. These plots are useful for understanding the shape of the data in three dimensions.

You can customize the colorscale, lighting, and contours to represent the surface data effectively.

!!! tip "Common Uses"
    - **3D Data Visualization**: Visualizing three variables with two independent variables and one dependent variable.
    - **Topographical Maps**: Representing elevations or contours of landscapes.
    - **Heatmaps in 3D**: Showing intensity variations in a 3D format.

_**Check out the [Attributes](../configuration/Trace/Props/Surface/#attributes) for the full set of configuration options**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple Surface Plot"

        Here's a simple `surface` plot showing a continuous 3D surface:

        ![](../../assets/example-charts/props/surface/simple-surface.png)

        You can copy this code below to create this chart in your project:

        ```yaml
        models:
          - name: surface-data
            args:
              - echo
              - |
                x,y,z
                1,1,1
                1,2,2
                1,3,3
                2,1,4
                2,2,5
                2,3,6
                3,1,7
                3,2,8
                3,3,9
        traces:
          - name: Simple Surface Plot
            model: ref(surface-data)
            props:
              type: surface
              x: ?{x}
              y: ?{y}
              z: ?{z}
        charts:
          - name: Simple Surface Chart
            traces:
              - ref(Simple Surface Plot)
            layout:
              title:
                text: Simple Surface Plot<br><sub>3D Surface Visualization</sub>
        ```

    === "Surface Plot with Custom Colorscale"

        This example demonstrates a `surface` plot with a custom colorscale applied to the surface:

        ![](../../assets/example-charts/props/surface/custom-colorscale-surface.png)

        Here's the code:

        ```yaml
        models:
          - name: surface-data-colorscale
            args:
              - echo
              - |
                x,y,z
                1,1,1
                1,2,2
                1,3,3
                2,1,4
                2,2,5
                2,3,6
                3,1,7
                3,2,8
                3,3,9
        traces:
          - name: Surface Plot with Custom Colorscale
            model: ref(surface-data-colorscale)
            props:
              type: surface
              x: ?{x}
              y: ?{y}
              z: ?{z}
              colorscale: "Viridis"
        charts:
          - name: Surface Chart with Custom Colorscale
            traces:
              - ref(Surface Plot with Custom Colorscale)
            layout:
              title:
                text: Surface Plot with Custom Colorscale<br><sub>Custom Colorscale for 3D Surface</sub>
        ```

    === "Surface Plot with Contours"

        Here's a `surface` plot where contour lines are added to the surface, highlighting the shape of the surface more clearly:

        ![](../../assets/example-charts/props/surface/surface-with-contours.png)

        Here's the code:

        ```yaml
        models:
          - name: surface-data-contours
            args:
              - echo
              - |
                x,y,z
                1,1,1
                1,2,2
                1,3,3
                2,1,4
                2,2,5
                2,3,6
                3,1,7
                3,2,8
                3,3,9
        traces:
          - name: Surface Plot with Contours
            model: ref(surface-data-contours)
            props:
              type: surface
              x: ?{x}
              y: ?{y}
              z: ?{z}
              contours:
                z:
                  show: true
                  usecolormap: true
                  highlightcolor: "#ff0000"
        charts:
          - name: Surface Chart with Contours
            traces:
              - ref(Surface Plot with Contours)
            layout:
              title:
                text: Surface Plot with Contours<br><sub>3D Surface with Contour Lines</sub>
        ```

{% endraw %}
<!--end-->