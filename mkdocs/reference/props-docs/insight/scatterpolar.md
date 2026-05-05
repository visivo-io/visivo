---
search:
  exclude: true
---

<!--start-->

## Overview

The `scatterpolar` insight type is used to create scatter plots on polar coordinates, which is ideal for visualizing data in a circular format. This type of plot allows data to be represented using angles and radial distances, making it useful for cyclic or directional data.

You can customize the marker size, color, and lines to connect points, similar to standard scatter plots, but within a polar coordinate system.

!!! tip "Common Uses" - **Cyclic Data Visualization**: Representing cyclic data such as time of day, seasonality, or wind direction. - **Directional Data**: Visualizing data with directional components, such as angular measurements. - **Circular Data Analysis**: Useful for data where radial distance and angle are key factors.

_**Check out the [Attributes](../../configuration/Insight/Props/Scatterpolar/#attributes) for the full set of configuration options**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple Scatterpolar Insight"

        ```yaml
        models:
          - name: scatterpolar-data
            args:
              - echo
              - |
                theta,r
                0,10
                45,20
                90,30
                135,25
                180,15
        insights:
          - name: Simple Scatterpolar Insight
            props:
              type: scatterpolar
              theta: ?{${ref(scatterpolar-data).theta}}
              r: ?{${ref(scatterpolar-data).r}}
              mode: "markers"
            interactions:
              - split: ?{ theta }
              - split: ?{ r }
        charts:
          - name: Simple Scatterpolar Chart
            insights:
              - ${ref(Simple Scatterpolar Insight)}
            layout:
              title:
                text: Simple Scatterpolar Plot<br><sub>Polar Data Points</sub>
        ```

    === "Scatterpolar Insight with Lines"

        ```yaml
        models:
          - name: scatterpolar-data-lines
            args:
              - echo
              - |
                theta,r
                0,5
                45,15
                90,20
                135,10
                180,25
        insights:
          - name: Scatterpolar Insight with Lines
            props:
              type: scatterpolar
              theta: ?{${ref(scatterpolar-data-lines).theta}}
              r: ?{${ref(scatterpolar-data-lines).r}}
              mode: "lines+markers"
            interactions:
              - split: ?{ theta }
              - split: ?{ r }
        charts:
          - name: Scatterpolar Chart with Lines
            insights:
              - ${ref(Scatterpolar Insight with Lines)}
            layout:
              title:
                text: Scatterpolar Plot with Lines<br><sub>Connecting Data Points with Lines in Polar Coordinates</sub>
        ```

    === "Scatterpolar Insight with Custom Marker Sizes and Colors"

        ```yaml
        models:
          - name: scatterpolar-data-custom
            args:
              - echo
              - |
                theta,r,size,color
                0,5,10,#1f77b4
                45,15,15,#ff7f0e
                90,20,20,#2ca02c
                135,10,25,#d62728
                180,25,30,#9467bd
        insights:
          - name: Scatterpolar Insight with Custom Markers
            props:
              type: scatterpolar
              theta: ?{${ref(scatterpolar-data-custom).theta}}
              r: ?{${ref(scatterpolar-data-custom).r}}
              mode: "markers"
              marker:
                size: ?{${ref(scatterpolar-data-custom).size}}
                color: ?{${ref(scatterpolar-data-custom).color}}
            interactions:
              - split: ?{ theta }
              - split: ?{ r }
              - split: ?{ color }
        charts:
          - name: Scatterpolar Chart with Custom Markers
            insights:
              - ${ref(Scatterpolar Insight with Custom Markers)}
            layout:
              title:
                text: Scatterpolar Plot with Custom Markers<br><sub>Custom Sizes and Colors for Polar Data Points</sub>
        ```

{% endraw %}

<!--end-->
