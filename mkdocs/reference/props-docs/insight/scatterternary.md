---
search:
  exclude: true
---

<!--start-->

## Overview

The `scatterternary` insight type is used to create scatter plots on ternary plots, which visualize proportions of three components that sum to a constant. It is ideal for fields like chemistry, soil science, and economics to explore relationships between three interdependent variables.

You can customize marker size, color, and lines to connect points, similar to scatter plots but within a ternary coordinate system.

!!! tip "Common Uses" - **Proportional Data Visualization**: Visualizing data involving three interdependent components. - **Ternary Relationship Analysis**: Exploring how three components relate to one another. - **Chemistry and Economics**: Useful for compositional data visualization.

_**Check out the [Attributes](../../configuration/Insight/Props/Scatterternary/#attributes) for the full set of configuration options**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple Scatterternary Insight"

        ```yaml
        models:
          - name: scatterternary-data
            args:
              - echo
              - |
                a,b,c
                0.1,0.5,0.4
                0.3,0.4,0.3
                0.5,0.3,0.2
                0.7,0.2,0.1
        insights:
          - name: Simple Scatterternary Insight
            model: ${ref(scatterternary-data)}
            columns:
              a: ?{ a }
              b: ?{ b }
              c: ?{ c }
            props:
              type: scatterternary
              a: ?{ columns.a }
              b: ?{ columns.b }
              c: ?{ columns.c }
              mode: "markers"
            interactions:
              - split: ?{ a }
              - split: ?{ b }
              - split: ?{ c }
        charts:
          - name: Simple Scatterternary Chart
            insights:
              - ${ref(Simple Scatterternary Insight)}
            layout:
              title:
                text: Simple Scatterternary Plot<br><sub>Data Points on a Ternary Plot</sub>
        ```

    === "Scatterternary Insight with Lines"

        ```yaml
        models:
          - name: scatterternary-data-lines
            args:
              - echo
              - |
                a,b,c
                0.2,0.6,0.2
                0.4,0.3,0.3
                0.6,0.2,0.2
                0.8,0.1,0.1
        insights:
          - name: Scatterternary Insight with Lines
            model: ${ref(scatterternary-data-lines)}
            columns:
              a: ?{ a }
              b: ?{ b }
              c: ?{ c }
            props:
              type: scatterternary
              a: ?{ columns.a }
              b: ?{ columns.b }
              c: ?{ columns.c }
              mode: "lines+markers"
            interactions:
              - split: ?{ a }
              - split: ?{ b }
              - split: ?{ c }
        charts:
          - name: Scatterternary Chart with Lines
            insights:
              - ${ref(Scatterternary Insight with Lines)}
            layout:
              title:
                text: Scatterternary Plot with Lines<br><sub>Connecting Data Points on a Ternary Plot</sub>
        ```

    === "Scatterternary Insight with Custom Marker Sizes and Colors"

        ```yaml
        models:
          - name: scatterternary-data-custom
            args:
              - echo
              - |
                a,b,c,size,color
                0.1,0.5,0.4,10,#1f77b4
                0.3,0.4,0.3,15,#ff7f0e
                0.5,0.3,0.2,20,#2ca02c
                0.7,0.2,0.1,25,#d62728
        insights:
          - name: Scatterternary Insight with Custom Markers
            model: ${ref(scatterternary-data-custom)}
            columns:
              a: ?{ a }
              b: ?{ b }
              c: ?{ c }
              size: ?{ size }
              color: ?{ color }
            props:
              type: scatterternary
              a: ?{ columns.a }
              b: ?{ columns.b }
              c: ?{ columns.c }
              mode: "markers"
              marker:
                size: ?{ columns.size }
                color: ?{ columns.color }
            interactions:
              - split: ?{ a }
              - split: ?{ b }
              - split: ?{ c }
              - split: ?{ color }
        charts:
          - name: Scatterternary Chart with Custom Markers
            insights:
              - ${ref(Scatterternary Insight with Custom Markers)}
            layout:
              title:
                text: Scatterternary Plot with Custom Markers<br><sub>Custom Sizes and Colors for Ternary Data Points</sub>
        ```

{% endraw %}

<!--end-->
