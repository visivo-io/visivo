---
search:
  exclude: true
---
<!--start-->
## Overview

The `streamtube` trace type is used to create 3D streamtube plots, which visualize flow or vector field data in three dimensions. Streamtubes are ideal for visualizing the behavior of fluid flow, electromagnetic fields, or any vector data where the direction and magnitude of flow are important.

You can customize the color, size, and path of the streamtubes to represent the flow data effectively.

!!! tip "Common Uses"
    - **Fluid Dynamics**: Visualizing the flow of fluids in a 3D space.
    - **Vector Field Analysis**: Analyzing vector fields like wind, magnetic, or electric fields.
    - **Flow Visualization**: Representing flow behavior over time or space.

_**Check out the [Attributes](../configuration/Trace/Props/Streamtube/#attributes) for the full set of configuration options**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple Streamtube Plot"

        This example uses a real, dense dataset from Plotly's sample CSV to ensure the streamtube renders properly:

        ```yaml
        models:
          - name: streamtube-data
            args:
              - curl
              - -sL
              - https://raw.githubusercontent.com/plotly/datasets/master/streamtube-basic.csv
        traces:
          - name: Simple Streamtube Plot
            model: ${ref(streamtube-data)}
            props:
              type: streamtube
              x: ?{x}
              y: ?{y}
              z: ?{z}
              u: ?{u}
              v: ?{v}
              w: ?{w}
        charts:
          - name: Simple Streamtube Chart
            traces:
              - ${ref(Simple Streamtube Plot)}
            layout:
              title:
                text: Simple Streamtube Plot<br><sub>3D Vector Field Visualization</sub>
        ```

    === "Streamtube Plot with Color Mapping"

        This example demonstrates a streamtube plot using the same CSV, with color mapping enabled:

        ```yaml
        models:
          - name: streamtube-data
            args:
              - curl
              - -sL
              - https://raw.githubusercontent.com/plotly/datasets/master/streamtube-basic.csv
        traces:
          - name: Streamtube Plot with Color Mapping
            model: ${ref(streamtube-data)}
            props:
              type: streamtube
              x: ?{x}
              y: ?{y}
              z: ?{z}
              u: ?{u}
              v: ?{v}
              w: ?{w}
              colorscale: "Viridis"
        charts:
          - name: Streamtube Chart with Color Mapping
            traces:
              - ${ref(Streamtube Plot with Color Mapping)}
            layout:
              title:
                text: Streamtube Plot with Color Mapping<br><sub>Vector Magnitude Represented by Color</sub>
        ```

    === "Streamtube Plot with Custom Tube Sizes"

        This example uses the same CSV and sets a custom tube size reference:

        ```yaml
        models:
          - name: streamtube-data
            args:
              - curl
              - -sL
              - https://raw.githubusercontent.com/plotly/datasets/master/streamtube-basic.csv
        traces:
          - name: Streamtube Plot with Custom Tube Sizes
            model: ${ref(streamtube-data)}
            props:
              type: streamtube
              x: ?{x}
              y: ?{y}
              z: ?{z}
              u: ?{u}
              v: ?{v}
              w: ?{w}
              sizeref: 0.5
        charts:
          - name: Streamtube Chart with Custom Tube Sizes
            traces:
              - ${ref(Streamtube Plot with Custom Tube Sizes)}
            layout:
              title:
                text: Streamtube Plot with Custom Tube Sizes<br><sub>Vector Magnitude Represented by Tube Size</sub>
        ```
{% endraw %}
<!--end-->