---
search:
  exclude: true
---

<!--start-->

## Overview

The `volume` insight type is used to create 3D volume plots, visualizing 3D scalar or density data. Volume insights are ideal for representing datasets where each (x, y, z) point in a grid has a value, such as in medical imaging, fluid dynamics, or other scientific applications.

You can customize opacity, surface levels, and colors to effectively show the internal structure of the volume.

!!! tip "Common Uses" - **Medical Imaging**: Visualizing 3D scans like MRI or CT data. - **Fluid Dynamics**: Representing 3D fields of density, pressure, or velocity. - **Scientific Visualization**: Displaying volumetric or scalar field data.

_**Check out the [Attributes](../../configuration/Insight/Props/Volume/#attributes) for the full set of configuration options**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple Volume Insight"

        ```yaml
        models:
          - name: isosurface-data-simple
            args:
              - echo
              - |
                idx,x,y,z,value
                0,0,0,1,1
                1,0,1,1,2
                2,0,0,0,3
                3,0,1,0,4
                4,1,0,1,5
                5,1,1,1,6
                6,1,0,0,7
                7,1,1,0,8

        insights:
          - name: Simple Isosurface Insight
            model: ${ref(isosurface-data-simple)}
            columns:
              idx: ?{idx}
              x: ?{x}
              y: ?{y}
              z: ?{z}
              value: ?{value}
            props:
              type: isosurface
              x: ?{columns.x}
              y: ?{columns.y}
              z: ?{columns.z}
              value: ?{columns.value}
              isomin: 2
              isomax: 6
              colorscale: "Reds"
            order_by:
              - ?{columns.idx asc}

        charts:
          - name: Simple Isosurface Chart
            insights:
              - ${ref(Simple Isosurface Insight)}
            layout:
              title:
                text: Simple Isosurface Plot<br><sub>3D Volume Visualization</sub>
        ```

{% endraw %}

<!--end-->
