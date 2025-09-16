---
search:
  exclude: true
---

<!--start-->

## Overview

The `streamtube` insight type is used to create 3D streamtube plots for visualizing flow or vector field data. Streamtubes effectively represent fluid flow, electromagnetic fields, or any vector data in three dimensions, showing both direction and magnitude.

You can customize the color, tube size, and vector paths to highlight patterns and behaviors in the flow data.

!!! tip "Common Uses" - **Fluid Dynamics**: Visualizing fluid flow in 3D space. - **Vector Field Analysis**: Representing wind, magnetic, or electric fields. - **Flow Visualization**: Showing flow behavior across time or space.

_**Check out the [Attributes](../configuration/Insight/Props/Streamtube/#attributes) for the full set of configuration options**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple Streamtube Insight"

        ```yaml
        models:
          - name: streamtube-data
            args:
              - curl
              - -sL
              - https://raw.githubusercontent.com/plotly/datasets/master/streamtube-basic.csv
        insights:
          - name: Simple Streamtube Insight
            model: ${ref(streamtube-data)}
            columns:
              x: ?{ x }
              y: ?{ y }
              z: ?{ z }
              u: ?{ u }
              v: ?{ v }
              w: ?{ w }
            props:
              type: streamtube
              x: ?{ columns.x }
              y: ?{ columns.y }
              z: ?{ columns.z }
              u: ?{ columns.u }
              v: ?{ columns.v }
              w: ?{ columns.w }
        charts:
          - name: Simple Streamtube Chart
            insights:
              - ${ref(Simple Streamtube Insight)}
            layout:
              title:
                text: Simple Streamtube Plot<br><sub>3D Vector Field Visualization</sub>
        ```

    === "Streamtube Insight with Color Mapping"

        ```yaml
        models:
          - name: streamtube-data
            args:
              - curl
              - -sL
              - https://raw.githubusercontent.com/plotly/datasets/master/streamtube-basic.csv
        insights:
          - name: Streamtube Insight with Color Mapping
            model: ${ref(streamtube-data)}
            columns:
              x: ?{ x }
              y: ?{ y }
              z: ?{ z }
              u: ?{ u }
              v: ?{ v }
              w: ?{ w }
            props:
              type: streamtube
              x: ?{ columns.x }
              y: ?{ columns.y }
              z: ?{ columns.z }
              u: ?{ columns.u }
              v: ?{ columns.v }
              w: ?{ columns.w }
              colorscale: "Viridis"
        charts:
          - name: Streamtube Chart with Color Mapping
            insights:
              - ${ref(Streamtube Insight with Color Mapping)}
            layout:
              title:
                text: Streamtube Plot with Color Mapping<br><sub>Vector Magnitude Represented by Color</sub>
        ```

    === "Streamtube Insight with Custom Tube Sizes"

        ```yaml
        models:
          - name: streamtube-data
            args:
              - curl
              - -sL
              - https://raw.githubusercontent.com/plotly/datasets/master/streamtube-basic.csv
        insights:
          - name: Streamtube Insight with Custom Tube Sizes
            model: ${ref(streamtube-data)}
            columns:
              x: ?{ x }
              y: ?{ y }
              z: ?{ z }
              u: ?{ u }
              v: ?{ v }
              w: ?{ w }
            props:
              type: streamtube
              x: ?{ columns.x }
              y: ?{ columns.y }
              z: ?{ columns.z }
              u: ?{ columns.u }
              v: ?{ columns.v }
              w: ?{ columns.w }
              sizeref: 0.5
        charts:
          - name: Streamtube Chart with Custom Tube Sizes
            insights:
              - ${ref(Streamtube Insight with Custom Tube Sizes)}
            layout:
              title:
                text: Streamtube Plot with Custom Tube Sizes<br><sub>Vector Magnitude Represented by Tube Size</sub>
        ```

{% endraw %}

<!--end-->
