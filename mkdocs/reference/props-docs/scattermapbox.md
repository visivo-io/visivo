---
search:
  exclude: true
---
<!--start-->
## Overview

The `scattermapbox` trace type is used to create scatter plots on a Mapbox map. This is ideal for visualizing geospatial data with the added customization and interactivity that Mapbox provides, including satellite imagery and street maps. 

You can plot geographic points with latitude and longitude and customize the marker size, color, and labels to represent data effectively.

!!! tip "Common Uses"
    - **Geospatial Analysis**: Plotting geographic points on an interactive map.
    - **Location-Based Data**: Visualizing locations and patterns on a Mapbox map.
    - **Mapping Events**: Plotting real-world events, like earthquakes or delivery points.

_**Check out the [Attributes](../configuration/Trace/Props/Scattermapbox/#attributes) for the full set of configuration options**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple Scattermapbox Plot"

        Here's a simple `scattermapbox` plot showing data points on a Mapbox map:

        ![](../../assets/example-charts/props/scattermapbox/simple-scattermapbox.png)

        You can copy this code below to create this chart in your project:

        ```yaml
        models:
          - name: scattermapbox-data
            args:
              - echo
              - |
                lon,lat
                -73.9857,40.7484
                -118.2437,34.0522
                -0.1276,51.5074
                139.6917,35.6895
        traces:
          - name: Simple Scattermapbox Plot
            model: ${ref(scattermapbox-data)}
            props:
              type: scattermapbox
              lon: ?{lon}
              lat: ?{lat}
              mode: "markers"
              marker:
                size: 10
        charts:
          - name: Simple Scattermapbox Chart
            traces:
              - ${ref(Simple Scattermapbox Plot)}
            layout:
              mapbox:
                style: "open-street-map"
              title:
                text: Simple Scattermapbox Plot<br><sub>Geographical Data Points on Mapbox</sub>
        ```

    === "Scattermapbox Plot with Lines"

        This example demonstrates a `scattermapbox` plot with lines connecting geographic points:

        ![](../../assets/example-charts/props/scattermapbox/lines-scattermapbox.png)

        Here's the code:

        ```yaml
        models:
          - name: scattermapbox-data-lines
            args:
              - echo
              - |
                lon,lat
                -73.9857,40.7484
                -118.2437,34.0522
                -0.1276,51.5074
                139.6917,35.6895
        traces:
          - name: Scattermapbox Plot with Lines
            model: ${ref(scattermapbox-data-lines)}
            props:
              type: scattermapbox
              lon: ?{lon}
              lat: ?{lat}
              mode: "lines+markers"
              marker:
                size: 10
        charts:
          - name: Scattermapbox Chart with Lines
            traces:
              - ${ref(Scattermapbox Plot with Lines)}
            layout:
              mapbox:
                style: "satellite-streets"
              title:
                text: Scattermapbox Plot with Lines<br><sub>Connecting Geographic Points on Mapbox</sub>
        ```

    === "Scattermapbox Plot with Custom Marker Sizes and Colors"

        Here's a `scattermapbox` plot with custom marker sizes and colors, giving more visual weight to each geographic data point:

        ![](../../assets/example-charts/props/scattermapbox/custom-markers-scattermapbox.png)

        Here's the code:

        ```yaml
        models:
          - name: scattermapbox-data-custom
            args:
              - echo
              - |
                lon,lat,size,color
                -73.9857,40.7484,10,#1f77b4
                -118.2437,34.0522,15,#ff7f0e
                -0.1276,51.5074,20,#2ca02c
                139.6917,35.6895,25,#d62728
        traces:
          - name: Scattermapbox Plot with Custom Markers
            model: ${ref(scattermapbox-data-custom)}
            props:
              type: scattermapbox
              lon: ?{lon}
              lat: ?{lat}
              mode: "markers"
              marker:
                size: ?{size}
                color: ?{color}
        charts:
          - name: Scattermapbox Chart with Custom Markers
            traces:
              - ${ref(Scattermapbox Plot with Custom Markers)}
            layout:
              mapbox:
                style: "dark"
              title:
                text: Scattermapbox Plot with Custom Markers<br><sub>Custom Sizes and Colors for Geographic Data Points</sub>
        ```

{% endraw %}
<!--end-->