
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

        Here's a simple `streamtube` plot showing the flow of vectors in 3D space:

        ![](../../assets/example-charts/props/streamtube/simple-streamtube.png)

        You can copy this code below to create this chart in your project:

        ```yaml
        models:
          - name: streamtube-data
            args:
              - echo
              - |
                x,y,z,u,v,w
                0,0,0,1,0,0
                1,0,0,0,1,0
                1,1,0,0,0,1
                0,1,1,-1,0,0
        traces:
          - name: Simple Streamtube Plot
            model: ref(streamtube-data)
            props:
              type: streamtube
              x: query(x)
              y: query(y)
              z: query(z)
              u: query(u)
              v: query(v)
              w: query(w)
        charts:
          - name: Simple Streamtube Chart
            traces:
              - ref(Simple Streamtube Plot)
            layout:
              title:
                text: Simple Streamtube Plot<br><sub>3D Vector Field Visualization</sub>
        ```

    === "Streamtube Plot with Color Mapping"

        This example demonstrates a `streamtube` plot where the color of the tubes represents the magnitude of the vector field:

        ![](../../assets/example-charts/props/streamtube/colored-streamtube.png)

        Here's the code:

        ```yaml
        models:
          - name: streamtube-data-color
            args:
              - echo
              - |
                x,y,z,u,v,w,magnitude
                0,0,0,1,0,0,1
                1,0,0,0,1,0,2
                1,1,0,0,0,1,3
                0,1,1,-1,0,0,4
        traces:
          - name: Streamtube Plot with Color Mapping
            model: ref(streamtube-data-color)
            props:
              type: streamtube
              x: query(x)
              y: query(y)
              z: query(z)
              u: query(u)
              v: query(v)
              w: query(w)
              colorscale: "Viridis"
              color: query(magnitude)
        charts:
          - name: Streamtube Chart with Color Mapping
            traces:
              - ref(Streamtube Plot with Color Mapping)
            layout:
              title:
                text: Streamtube Plot with Color Mapping<br><sub>Vector Magnitude Represented by Color</sub>
        ```

    === "Streamtube Plot with Custom Tube Sizes"

        Here's a `streamtube` plot where the tube size is customized based on the magnitude of the vector field:

        ![](../../assets/example-charts/props/streamtube/custom-tube-size-streamtube.png)

        Here's the code:

        ```yaml
        models:
          - name: streamtube-data-size
            args:
              - echo
              - |
                x,y,z,u,v,w,magnitude
                0,0,0,1,0,0,1
                1,0,0,0,1,0,2
                1,1,0,0,0,1,3
                0,1,1,-1,0,0,4
        traces:
          - name: Streamtube Plot with Custom Tube Sizes
            model: ref(streamtube-data-size)
            props:
              type: streamtube
              x: query(x)
              y: query(y)
              z: query(z)
              u: query(u)
              v: query(v)
              w: query(w)
              tube_sizeref: 0.5
        charts:
          - name: Streamtube Chart with Custom Tube Sizes
            traces:
              - ref(Streamtube Plot with Custom Tube Sizes)
            layout:
              title:
                text: Streamtube Plot with Custom Tube Sizes<br><sub>Vector Magnitude Represented by Tube Size</sub>
        ```

{% endraw %}
