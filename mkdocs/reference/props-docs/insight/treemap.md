---
search:
  exclude: true
---

<!--start-->

## Overview

The `treemap` insight type is used to create treemap charts, visualizing hierarchical data through nested rectangles. Treemap insights are ideal for exploring part-to-whole relationships and comparing the size of different categories.

You can customize the colors, labels, hierarchy, and tiling to represent your data effectively.

!!! tip "Common Uses" - **Hierarchical Data Visualization**: Displaying nested data as rectangles. - **Part-to-Whole Relationships**: Visualizing contributions of categories to the whole. - **Categorical Data**: Showing nested categorical breakdowns.

!!! warning "Unexpected Behavior"
The terminal values of a `treemap` must be unique. Values must be unique across all leaf nodes.

_**Check out the [Attributes](../configuration/Insight/Props/Treemap/#attributes) for the full set of configuration options**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple Treemap Insight"

        ```yaml
        models:
          - name: treemap-data
            args:
              - echo
              - |
                labels,parents,values
                Total,,100
                A,Total,40
                B,Total,30
                C,Total,30
                D,A,10
                E,A,20
                F,B,10
        insights:
          - name: Simple Treemap Insight
            model: ${ref(treemap-data)}
            columns:
              labels: ?{labels}
              parents: ?{parents}
              values: ?{"values"}
            props:
              type: treemap
              labels: ?{columns.labels}
              parents: ?{columns.parents}
              values: ?{columns.values}
              marker:
                colorscale: Blackbody
              textposition: "middle center"
              texttemplate: "<b>%{label}</b>"
              textfont:
                size: 12
        charts:
          - name: Simple Treemap Chart
            insights:
              - ${ref(Simple Treemap Insight)}
            layout:
              title:
                text: Simple Treemap Chart<br><sub>Hierarchical Data Visualization</sub>
        ```

    === "Treemap Insight with Custom Colors"

        ```yaml
        models:
          - name: treemap-data-colors
            args:
              - echo
              - |
                labels,parents,values,colors
                Total,,100,#1f77b4
                A,Total,40,#ff7f0e
                B,Total,30,#2ca02c
                C,Total,30,#d62728
                D,A,10,#9467bd
                E,A,20,#8c564b
                F,B,10,#e377c2
        insights:
          - name: Treemap Insight with Custom Colors
            model: ${ref(treemap-data-colors)}
            columns:
              labels: ?{labels}
              parents: ?{parents}
              values: ?{"values"}
              colors: ?{colors}
            props:
              type: treemap
              labels: ?{columns.labels}
              parents: ?{columns.parents}
              values: ?{columns.values}
              marker:
                colors: ?{columns.colors}
                line:
                  color: black
        charts:
          - name: Treemap Chart with Custom Colors
            insights:
              - ${ref(Treemap Insight with Custom Colors)}
            layout:
              title:
                text: Treemap Plot with Custom Colors<br><sub>Custom Colors for Each Category</sub>
        ```

    === "Treemap Insight with Custom Tiling"

        ```yaml
        models:
          - name: treemap-data-tiling
            args:
              - echo
              - |
                labels,parents,values
                Total,,100
                A,Total,40
                B,Total,30
                C,Total,30
                D,A,15
                E,A,25
                F,B,10
                G,B,20
                H,C,15
                I,C,15
        insights:
          - name: Treemap Insight with Custom Tiling
            model: ${ref(treemap-data-tiling)}
            columns:
              labels: ?{labels}
              parents: ?{parents}
              values: ?{"values"}
            props:
              type: treemap
              labels: ?{columns.labels}
              parents: ?{columns.parents}
              values: ?{columns.values}
              tiling:
                packing: binary
                squarifyratio: 1.5
        charts:
          - name: Treemap Chart with Custom Tiling
            insights:
              - ${ref(Treemap Insight with Custom Tiling)}
            layout:
              title:
                text: Treemap Plot with Custom Tiling<br><sub>Binary Packing and Custom Squarify Ratio</sub>
        ```

{% endraw %}

<!--end-->
