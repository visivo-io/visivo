---
search:
  exclude: true
---

<!--start-->

## Overview

The `surface` insight type is used to create 3D surface plots, visualizing the relationship between three variables on a continuous surface. Surface insights are ideal for exploring how two independent variables interact to affect a dependent variable.

You can customize the colorscale, lighting, and contours to represent your 3D data effectively.

!!! tip "Common Uses" - **3D Data Visualization**: Showing relationships between three variables. - **Topographical Maps**: Representing elevation or landscape contours. - **3D Heatmaps**: Visualizing intensity or magnitude variations in three dimensions.

_**Check out the [Attributes](../../configuration/Insight/Props/Surface/#attributes) for the full set of configuration options**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple Surface Insight"

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
        insights:
          - name: Simple Surface Insight
            model: ${ref(surface-data)}
            columns:
              x: ?{x}
              y: ?{y}
              z: ?{z}
            props:
              type: surface
              x: ?{columns.x}
              y: ?{columns.y}
              z: ?{columns.z}
        charts:
          - name: Simple Surface Chart
            insights:
              - ${ref(Simple Surface Insight)}
            layout:
              title:
                text: Simple Surface Plot<br><sub>3D Surface Visualization</sub>
        ```

    === "Surface Insight with Custom Colorscale"

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
        insights:
          - name: Surface Insight with Custom Colorscale
            model: ${ref(surface-data-colorscale)}
            columns:
              x: ?{x}
              y: ?{y}
              z: ?{z}
            props:
              type: surface
              x: ?{columns.x}
              y: ?{columns.y}
              z: ?{columns.z}
              colorscale: "Viridis"
        charts:
          - name: Surface Chart with Custom Colorscale
            insights:
              - ${ref(Surface Insight with Custom Colorscale)}
            layout:
              title:
                text: Surface Plot with Custom Colorscale<br><sub>Custom Colorscale for 3D Surface</sub>
        ```

    === "Surface Insight with Contours"

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
        insights:
          - name: Surface Insight with Contours
            model: ${ref(surface-data-contours)}
            columns:
              x: ?{x}
              y: ?{y}
              z: ?{z}
            props:
              type: surface
              x: ?{columns.x}
              y: ?{columns.y}
              z: ?{columns.z}
              contours:
                z:
                  show: true
                  usecolormap: true
                  highlightcolor: "#ff0000"
        charts:
          - name: Surface Chart with Contours
            insights:
              - ${ref(Surface Insight with Contours)}
            layout:
              title:
                text: Surface Plot with Contours<br><sub>3D Surface with Contour Lines</sub>
        ```

{% endraw %}

<!--end-->
