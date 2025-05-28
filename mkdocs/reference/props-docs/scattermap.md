---
search:
  exclude: true
---
<!--start-->
## Overview

The `scattermap` trace type is used to create scatter plots on a MapLibre map. This is ideal for visualizing geospatial data with the added customization and interactivity that MapLibre provides, including satellite imagery and street maps. 

You can plot geographic points with latitude and longitude and customize the marker size, color, and labels to represent data effectively.

!!! tip "Common Uses"
    - **Geospatial Analysis**: Plotting geographic points on an interactive map.
    - **Location-Based Data**: Visualizing locations and patterns on a MapLibre map.
    - **Mapping Events**: Plotting real-world events, like earthquakes or delivery points.

_**Check out the [Attributes](../configuration/Trace/Props/Scattermap/#attributes) for the full set of configuration options**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple Scattermap Plot"

        Here's a simple `scattermap` plot showing data points on a MapLibre map:


        You can copy this code below to create this chart in your project:

        ```yaml
        models:
          - name: scattermap-data
            args:
              - echo
              - |
                lon,lat
                -73.9857,40.7484
                -118.2437,34.0522
                -0.1276,51.5074
                139.6917,35.6895
        traces:
          - name: Simple Scattermap Plot
            model: ${ref(scattermap-data)}
            props:
              type: scattermap
              lon: ?{lon}
              lat: ?{lat}
              mode: "markers"
              marker:
                size: 10
        charts:
          - name: Simple Scattermap Chart
            traces:
              - ${ref(Simple Scattermap Plot)}
            layout:
              mapbox:
                style: "open-street-map"
              title:
                text: Simple Scattermap Plot<br><sub>Geographical Data Points on MapLibre</sub>
        ```

    === "Scattermap Plot with Lines"

        This example demonstrates a `scattermap` plot with lines connecting geographic points:


        Here's the code:

        ```yaml
        models:
          - name: scattermap-data-lines
            args:
              - echo
              - |
                lon,lat
                -73.9857,40.7484
                -118.2437,34.0522
                -0.1276,51.5074
                139.6917,35.6895
        traces:
          - name: Scattermap Plot with Lines
            model: ${ref(scattermap-data-lines)}
            props:
              type: scattermap
              lon: ?{lon}
              lat: ?{lat}
              mode: "lines+markers"
              marker:
                size: 10
        charts:
          - name: Scattermap Chart with Lines
            traces:
              - ${ref(Scattermap Plot with Lines)}
            layout:
              mapbox:
                style: "satellite-streets"
              title:
                text: Scattermap Plot with Lines<br><sub>Connecting Geographic Points on MapLibre</sub>
        ```

    === "Scattermap Plot with Custom Marker Sizes and Colors"

        Here's a `scattermap` plot with custom marker sizes and colors, giving more visual weight to each geographic data point:


        Here's the code:

        ```yaml
        models:
          - name: scattermap-data-custom
            args:
              - echo
              - |
                lon,lat,size,color
                -73.9857,40.7484,10,#1f77b4
                -118.2437,34.0522,15,#ff7f0e
                -0.1276,51.5074,20,#2ca02c
                139.6917,35.6895,25,#d62728
        traces:
          - name: Scattermap Plot with Custom Markers
            model: ${ref(scattermap-data-custom)}
            props:
              type: scattermap
              lon: ?{lon}
              lat: ?{lat}
              mode: "markers"
              marker:
                size: ?{size}
                color: ?{color}
        charts:
          - name: Scattermap Chart with Custom Markers
            traces:
              - ${ref(Scattermap Plot with Custom Markers)}
            layout:
              mapbox:
                style: "dark"
              title:
                text: Scattermap Plot with Custom Markers<br><sub>Custom Sizes and Colors for Geographic Data Points</sub>
        ```

{% endraw %}
<!--end-->