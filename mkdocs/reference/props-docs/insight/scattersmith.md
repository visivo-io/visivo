---
search:
  exclude: true
---

<!--start-->

## Overview

The `scattersmith` insight type is used to create scatter plots on a Smith chart, commonly used in electrical engineering to represent complex impedance and reflection coefficients. It allows plotting data in terms of real and imaginary components, making it ideal for analyzing electrical circuits.

You can customize marker size, color, and lines to connect points, similar to scatter plots, but specifically tailored for Smith charts.

!!! tip "Common Uses" - **Impedance and Reflection Coefficients**: Visualizing electrical properties in transmission lines. - **Complex Data Visualization**: Representing data points in terms of complex numbers. - **Electrical Engineering Analysis**: Useful for RF and microwave engineering applications.

_**Check out the [Attributes](../../configuration/Insight/Props/Scattersmith/#attributes) for the full set of configuration options**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple Scattersmith Insight"

        ```yaml
        models:
          - name: scattersmith-data
            args:
              - echo
              - |
                real,imaginary
                0.5,0.2
                0.8,0.3
                1.0,0.5
                1.2,0.7
        insights:
          - name: Simple Scattersmith Insight
            props:
              type: scattersmith
              real: ?{${ref(scattersmith-data).real}}
              imag: ?{${ref(scattersmith-data).imaginary}}
              mode: "markers"
            interactions:
              - split: ?{ real }
              - split: ?{ imaginary }
        charts:
          - name: Simple Scattersmith Chart
            insights:
              - ${ref(Simple Scattersmith Insight)}
            layout:
              title:
                text: Simple Scattersmith Plot<br><sub>Data Points on Smith Chart</sub>
        ```

    === "Scattersmith Insight with Lines"

        ```yaml
        models:
          - name: scattersmith-data-lines
            args:
              - echo
              - |
                real,imaginary
                0.2,0.1
                0.5,0.4
                0.7,0.6
                1.0,0.8
        insights:
          - name: Scattersmith Insight with Lines
            props:
              type: scattersmith
              real: ?{${ref(scattersmith-data-lines).real}}
              imag: ?{${ref(scattersmith-data-lines).imaginary}}
              mode: "lines+markers"
            interactions:
              - split: ?{ real }
              - split: ?{ imaginary }
        charts:
          - name: Scattersmith Chart with Lines
            insights:
              - ${ref(Scattersmith Insight with Lines)}
            layout:
              title:
                text: Scattersmith Plot with Lines<br><sub>Connecting Data Points on Smith Chart</sub>
        ```

    === "Scattersmith Insight with Custom Marker Sizes and Colors"

        ```yaml
        models:
          - name: scattersmith-data-custom
            args:
              - echo
              - |
                real,imaginary,size,color
                0.5,0.2,10,#1f77b4
                0.8,0.3,15,#ff7f0e
                1.0,0.5,20,#2ca02c
                1.2,0.7,25,#d62728
        insights:
          - name: Scattersmith Insight with Custom Markers
            props:
              type: scattersmith
              real: ?{${ref(scattersmith-data-custom).real}}
              imag: ?{${ref(scattersmith-data-custom).imaginary}}
              mode: "markers"
              marker:
                size: ?{${ref(scattersmith-data-custom).size}}
                color: ?{${ref(scattersmith-data-custom).color}}
            interactions:
              - split: ?{ real }
              - split: ?{ imaginary }
              - split: ?{ color }
        charts:
          - name: Scattersmith Chart with Custom Markers
            insights:
              - ${ref(Scattersmith Insight with Custom Markers)}
            layout:
              title:
                text: Scattersmith Plot with Custom Markers<br><sub>Custom Sizes and Colors for Smith Chart Data Points</sub>
        ```

{% endraw %}

<!--end-->
