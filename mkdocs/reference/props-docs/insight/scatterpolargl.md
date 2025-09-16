---
search:
  exclude: true
---

<!--start-->

## Overview

The `scatterpolargl` insight type is used to create scatter plots on polar coordinates using WebGL rendering. This allows high-performance plotting of large datasets in polar coordinates, ideal for scenarios with many data points.

You can customize marker size, color, and lines to connect points, similar to `scatterpolar`, but with WebGL's performance advantages.

!!! tip "Common Uses" - **Large Datasets in Polar Coordinates**: Efficiently visualize many data points. - **Performance Optimization**: Use WebGL for fast rendering. - **Circular Data with Directional Components**: Ideal for cyclic data where radial distance and angle are key factors.

_**Check out the [Attributes](../configuration/Insight/Props/Scatterpolargl/#attributes) for the full set of configuration options**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple Scatterpolargl Insight"

        ```yaml
        models:
          - name: scatterpolargl-data
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
          - name: Simple Scatterpolargl Insight
            model: ${ref(scatterpolargl-data)}
            columns:
              theta: ?{ theta }
              r: ?{ r }
            props:
              type: scatterpolargl
              theta: ?{ columns.theta }
              r: ?{ columns.r }
              mode: "markers"
            interactions:
              - split: ?{ theta }
              - split: ?{ r }
        charts:
          - name: Simple Scatterpolargl Chart
            insights:
              - ${ref(Simple Scatterpolargl Insight)}
            layout:
              title:
                text: Simple Scatterpolargl Plot<br><sub>High-Performance Polar Data Points</sub>
        ```

    === "Scatterpolargl Insight with Lines"

        ```yaml
        models:
          - name: scatterpolargl-data-lines
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
          - name: Scatterpolargl Insight with Lines
            model: ${ref(scatterpolargl-data-lines)}
            columns:
              theta: ?{ theta }
              r: ?{ r }
            props:
              type: scatterpolargl
              theta: ?{ columns.theta }
              r: ?{ columns.r }
              mode: "lines+markers"
            interactions:
              - split: ?{ theta }
              - split: ?{ r }
        charts:
          - name: Scatterpolargl Chart with Lines
            insights:
              - ${ref(Scatterpolargl Insight with Lines)}
            layout:
              title:
                text: Scatterpolargl Plot with Lines<br><sub>Connecting Data Points with Lines in Polar Coordinates</sub>
        ```

    === "Scatterpolargl Insight with Custom Marker Sizes and Colors"

        ```yaml
        models:
          - name: scatterpolargl-data-custom
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
          - name: Scatterpolargl Insight with Custom Markers
            model: ${ref(scatterpolargl-data-custom)}
            columns:
              theta: ?{ theta }
              r: ?{ r }
              size: ?{ size }
              color: ?{ color }
            props:
              type: scatterpolargl
              theta: ?{ columns.theta }
              r: ?{ columns.r }
              mode: "markers"
              marker:
                size: ?{ columns.size }
                color: ?{ columns.color }
            interactions:
              - split: ?{ theta }
              - split: ?{ r }
              - split: ?{ color }
        charts:
          - name: Scatterpolargl Chart with Custom Markers
            insights:
              - ${ref(Scatterpolargl Insight with Custom Markers)}
            layout:
              title:
                text: Scatterpolargl Plot with Custom Markers<br><sub>Custom Sizes and Colors for Polar Data Points</sub>
        ```

{% endraw %}

<!--end-->
