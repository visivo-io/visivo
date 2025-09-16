---
search:
  exclude: true
---

<!--start-->

## Overview

The `mesh3d` insight type is used to create 3D mesh plots, which visualize 3D surfaces defined by vertices and connections between them. Mesh plots are commonly used in 3D data visualization to represent geometric shapes, surfaces, and volumes.

You can customize the colors, vertex positions, and opacity to represent 3D data and geometries effectively.

!!! tip "Common Uses" - **3D Geometries**: Visualizing surfaces and volumes in 3D space. - **Scientific Visualization**: Representing complex 3D data in fields like physics, engineering, and geology. - **3D Surface Rendering**: Displaying 3D surfaces from a set of points and connectivity information.

_**Check out the [Attributes](../configuration/Insight/Props/Mesh3d/#attributes) for the full set of configuration options**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple Mesh3D Plot"

        Here's a simple `mesh3d` insight visualizing a 3D mesh structure with vertices and connections:

        ![](../../assets/example-charts/props/mesh3d/simple-mesh3d.png)

        You can copy this code below to create this chart in your project:

        ```yaml
        models:
          - name: mesh3d-data
            args:
              - echo
              - |
                idx,x,y,z,i,j,k,color
                0,0,0,0,0,1,2,#1f77b4
                1,1,0,2,0,2,3,#ff7f0e
                2,2,1,0,0,3,1,#2ca02c
                3,0,2,1,1,2,3,#9467bd

        insights:
          - name: Simple Mesh3D Insight
            model: ${ref(mesh3d-data)}
            columns:
              idx: ?{idx}
              x: ?{x}
              y: ?{y}
              z: ?{z}
              i: ?{i}
              j: ?{j}
              k: ?{k}
              color: ?{color}
            props:
              type: mesh3d
              x: ?{columns.x}
              y: ?{columns.y}
              z: ?{columns.z}
              i: ?{columns.i}
              j: ?{columns.j}
              k: ?{columns.k}
              facecolor: ?{columns.color}
              opacity: 0.7
            order_by:
              - ?{columns.idx asc}

        charts:
          - name: Simple Mesh3D Chart
            insights:
              - ${ref(Simple Mesh3D Insight)}
            layout:
              title:
                text: Simple Mesh3D Plot<br><sub>3D Mesh Surface Visualization</sub>
        ```

{% endraw %}

<!--end-->
