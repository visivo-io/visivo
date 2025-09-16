---
search:
  exclude: true
---

<!--start-->

## Overview

The `scattermap` insight type is used to create scatter plots on a MapLibre map. This is ideal for visualizing geospatial data with the added customization and interactivity that MapLibre provides, including satellite imagery and street maps.

You can plot geographic points with latitude and longitude and customize the marker size, color, and labels to represent data effectively.

!!! tip "Common Uses" - **Geospatial Analysis**: Plotting geographic points on an interactive map. - **Location-Based Data**: Visualizing locations and patterns on a MapLibre map. - **Mapping Events**: Plotting real-world events, like earthquakes or delivery points.

_**Check out the [Attributes](../../configuration/Insight/Props/Scattermap/#attributes) for the full set of configuration options**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple Scattermap Insight"

        Here's a simple `scattermap` insight showing data points on a MapLibre map:

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
        insights:
          - name: Simple Scattermap Insight
            model: ${ref(scattermap-data)}
            columns:
              lon: ?{ lon }
              lat: ?{ lat }
            props:
              type: scattermap
              lon: ?{ columns.lon }
              lat: ?{ columns.lat }
              mode: "markers"
              marker:
                size: 10
            interactions:
              - split: ?{ lon }
              - split: ?{ lat }
        charts:
          - name: Simple Scattermap Chart
            insights:
              - ${ref(Simple Scattermap Insight)}
            layout:
              mapbox:
                style: "open-street-map"
              title:
                text: Simple Scattermap Plot<br><sub>Geographical Data Points on MapLibre</sub>
        ```

    === "Scattermap Insight with Lines"

        This example demonstrates a `scattermap` insight with lines connecting geographic points:

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
        insights:
          - name: Scattermap Insight with Lines
            model: ${ref(scattermap-data-lines)}
            columns:
              lon: ?{ lon }
              lat: ?{ lat }
            props:
              type: scattermap
              lon: ?{ columns.lon }
              lat: ?{ columns.lat }
              mode: "lines+markers"
              marker:
                size: 10
            interactions:
              - split: ?{ lon }
              - split: ?{ lat }
        charts:
          - name: Scattermap Chart with Lines
            insights:
              - ${ref(Scattermap Insight with Lines)}
            layout:
              mapbox:
                style: "satellite-streets"
              title:
                text: Scattermap Plot with Lines<br><sub>Connecting Geographic Points on MapLibre</sub>
        ```

    === "Scattermap Insight with Custom Marker Sizes and Colors"

        Here's a `scattermap` insight with custom marker sizes and colors:

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
        insights:
          - name: Scattermap Insight with Custom Markers
            model: ${ref(scattermap-data-custom)}
            columns:
              lon: ?{ lon }
              lat: ?{ lat }
              size: ?{ size }
              color: ?{ color }
            props:
              type: scattermap
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
          - name: Scattermap Chart with Custom Markers
            insights:
              - ${ref(Scattermap Insight with Custom Markers)}
            layout:
              mapbox:
                style: "dark"
              title:
                text: Scattermap Plot with Custom Markers<br><sub>Custom Sizes and Colors for Geographic Data Points</sub>
        ```

{% endraw %}

<!--end-->
