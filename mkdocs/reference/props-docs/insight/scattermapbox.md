---
search:
  exclude: true
---

<!--start-->

## Overview

The `scattermapbox` insight type is used to create scatter plots on a Mapbox map. This is ideal for visualizing geospatial data with the added customization and interactivity that Mapbox provides, including satellite imagery and street maps.

You can plot geographic points with latitude and longitude and customize the marker size, color, and labels to represent data effectively.

!!! tip "Common Uses" - **Geospatial Analysis**: Plotting geographic points on an interactive map. - **Location-Based Data**: Visualizing locations and patterns on a Mapbox map. - **Mapping Events**: Plotting real-world events, like earthquakes or delivery points.

_**Check out the [Attributes](../configuration/Insight/Props/Scattermapbox/#attributes) for the full set of configuration options**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple Scattermapbox Insight"

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
        insights:
          - name: Simple Scattermapbox Insight
            model: ${ref(scattermapbox-data)}
            columns:
              lon: ?{ lon }
              lat: ?{ lat }
            props:
              type: scattermapbox
              lon: ?{ columns.lon }
              lat: ?{ columns.lat }
              mode: "markers"
              marker:
                size: 10
            interactions:
              - split: ?{ lon }
              - split: ?{ lat }
        charts:
          - name: Simple Scattermapbox Chart
            insights:
              - ${ref(Simple Scattermapbox Insight)}
            layout:
              mapbox:
                style: "open-street-map"
              title:
                text: Simple Scattermapbox Plot<br><sub>Geographical Data Points on Mapbox</sub>
        ```

    === "Scattermapbox Insight with Lines"

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
        insights:
          - name: Scattermapbox Insight with Lines
            model: ${ref(scattermapbox-data-lines)}
            columns:
              lon: ?{ lon }
              lat: ?{ lat }
            props:
              type: scattermapbox
              lon: ?{ columns.lon }
              lat: ?{ columns.lat }
              mode: "lines+markers"
              marker:
                size: 10
            interactions:
              - split: ?{ lon }
              - split: ?{ lat }
        charts:
          - name: Scattermapbox Chart with Lines
            insights:
              - ${ref(Scattermapbox Insight with Lines)}
            layout:
              mapbox:
                style: "satellite-streets"
              title:
                text: Scattermapbox Plot with Lines<br><sub>Connecting Geographic Points on Mapbox</sub>
        ```

    === "Scattermapbox Insight with Custom Marker Sizes and Colors"

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
        insights:
          - name: Scattermapbox Insight with Custom Markers
            model: ${ref(scattermapbox-data-custom)}
            columns:
              lon: ?{ lon }
              lat: ?{ lat }
              size: ?{ size }
              color: ?{ color }
            props:
              type: scattermapbox
              lon: ?{ columns.lon }
              lat: ?{ columns.lat }
              mode: "markers"
              marker:
                size: ?{ columns.size }
                color: ?{ columns.color }
            interactions:
              - split: ?{ lon }
              - split: ?{ lat }
              - split: ?{ color }
        charts:
          - name: Scattermapbox Chart with Custom Markers
            insights:
              - ${ref(Scattermapbox Insight with Custom Markers)}
            layout:
              mapbox:
                style: "dark"
              title:
                text: Scattermapbox Plot with Custom Markers<br><sub>Custom Sizes and Colors for Geographic Data Points</sub>
        ```

{% endraw %}

<!--end-->
