---
search:
  exclude: true
---

<!--start-->

## Overview

The `densitymapbox` insight is used to create density maps on a **Mapbox** layer. This is commonly used to visualize the density of points in a geographical area. Density maps can help in identifying hotspots or areas with a higher concentration of data points.

You can customize the colorscale, radius of influence for each point, and other properties to fine-tune the visualization.

!!! tip "Common Uses" - **Geospatial Data Analysis**: Identifying hotspots in geographic data, such as crime rates or customer locations. - **Event Density**: Visualizing the concentration of events or occurrences across regions. - **Heatmap for Geographic Points**: Creating heatmaps based on spatial data distributions on a map.

_**Check out the [Attributes](../configuration/Insight/Props/Densitymapbox/#attributes) for the full set of configuration options.**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple Densitymapbox Insight"

        Here's a simple `densitymapbox` insight showing the density of random points on a Mapbox map:

        ```yaml
        models:
          - name: densitymapbox-data
            args:
              - echo
              - |
                lat,lon
                37.7749,-122.4194
                34.0522,-118.2437
                40.7128,-74.0060
                41.8781,-87.6298
                29.7604,-95.3698
        insights:
          - name: Simple Densitymapbox Insight
            model: ${ref(densitymapbox-data)}
            columns:
              lat: ?{lat}
              lon: ?{lon}
            props:
              type: densitymapbox
              lat: ?{columns.lat}
              lon: ?{columns.lon}
              radius: 10
              colorscale: "Viridis"
              zmin: 0
              zmax: 100
        charts:
          - name: Simple Densitymapbox Chart
            insights:
              - ${ref(Simple Densitymapbox Insight)}
            layout:
              title:
                text: Simple Densitymapbox Insight<br><sub>Spatial Data Density</sub>
              mapbox:
                style: "carto-positron"
                zoom: 3
                center:
                  lat: 37
                  lon: -95
        ```

    === "Densitymapbox with Custom Radius"

        This example demonstrates a `densitymapbox` insight with a custom radius for the points, which influences how smooth the heatmap appears:

        ```yaml
        models:
          - name: densitymapbox-data-radius
            args:
              - echo
              - |
                lat,lon
                51.5074,-0.1278
                48.8566,2.3522
                52.5200,13.4050
                40.7128,-74.0060
                34.0522,-118.2437
        insights:
          - name: Densitymapbox with Custom Radius
            model: ${ref(densitymapbox-data-radius)}
            columns:
              lat: ?{lat}
              lon: ?{lon}
            props:
              type: densitymapbox
              lat: ?{columns.lat}
              lon: ?{columns.lon}
              radius: 20
              colorscale: "Jet"
              zmin: 0
              zmax: 50
        charts:
          - name: Densitymapbox Chart with Custom Radius
            insights:
              - ${ref(Densitymapbox with Custom Radius)}
            layout:
              title:
                text: Densitymapbox Insight with Custom Radius<br><sub>Radius of Influence on Heatmap</sub>
              mapbox:
                style: "carto-darkmatter"
                zoom: 2
                center:
                  lat: 50
                  lon: 0
        ```

    === "Densitymapbox with Custom Colorscale"

        This example shows a `densitymapbox` insight with a custom colorscale and zoom centered on Europe:

        ```yaml
        models:
          - name: densitymapbox-data-colorscale
            args:
              - echo
              - |
                lat,lon
                48.8566,2.3522
                41.9028,12.4964
                52.3676,4.9041
                40.4168,-3.7038
                51.1657,10.4515
        insights:
          - name: Densitymapbox with Custom Colorscale
            model: ${ref(densitymapbox-data-colorscale)}
            columns:
              lat: ?{lat}
              lon: ?{lon}
            props:
              type: densitymapbox
              lat: ?{columns.lat}
              lon: ?{columns.lon}
              radius: 15
              colorscale: [[0, "rgb(255,245,240)"], [0.5, "rgb(252,146,114)"], [1, "rgb(165,15,21)"]]
              zmin: 0
              zmax: 50
        charts:
          - name: Densitymapbox Chart with Custom Colorscale
            insights:
              - ${ref(Densitymapbox with Custom Colorscale)}
            layout:
              title:
                text: Densitymapbox Insight with Custom Colorscale<br><sub>Custom Coloring and Center</sub>
              mapbox:
                style: "carto-positron"
                zoom: 4
                center:
                  lat: 48
                  lon: 3
        ```

{% endraw %}

<!--end-->
