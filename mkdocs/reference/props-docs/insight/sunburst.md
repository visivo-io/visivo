---
search:
  exclude: true
---

<!--start-->

## Overview

The `sunburst` insight type is used to create sunburst charts, visualizing hierarchical data in a circular format. Sunburst insights are ideal for showing part-to-whole relationships and nested data, with categories radiating outward from the center.

You can customize labels, hierarchy, colors, and segment sizes to represent your data effectively.

!!! tip "Common Uses" - **Hierarchical Data Visualization**: Showing relationships between multiple levels of data. - **Part-to-Whole Relationships**: Visualizing contributions of parts to the whole. - **Categorical Data Breakdown**: Representing nested categories.

_**Check out the [Attributes](../../configuration/Insight/Props/Sunburst/#attributes) for the full set of configuration options**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple Sunburst Insight"

        ```yaml
        models:
          - name: sunburst-data
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
          - name: Simple Sunburst Insight
            model: ${ref(sunburst-data)}
            columns:
              labels: ?{labels}
              parents: ?{parents}
              values: ?{values}
            props:
              type: sunburst
              labels: ?{columns.labels}
              parents: ?{columns.parents}
              values: ?{columns.values}
        charts:
          - name: Simple Sunburst Chart
            insights:
              - ${ref(Simple Sunburst Insight)}
            layout:
              title:
                text: Simple Sunburst Chart<br><sub>Hierarchical Data Visualization</sub>
        ```

    === "Sunburst Insight with Custom Colors"

        ```yaml
        models:
          - name: sunburst-data-colors
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
          - name: Sunburst Insight with Custom Colors
            model: ${ref(sunburst-data-colors)}
            columns:
              labels: ?{labels}
              parents: ?{parents}
              values: ?{values}
              colors: ?{colors}
            props:
              type: sunburst
              labels: ?{columns.labels}
              parents: ?{columns.parents}
              values: ?{columns.values}
              marker:
                colors: ?{columns.colors}
        charts:
          - name: Sunburst Chart with Custom Colors
            insights:
              - ${ref(Sunburst Insight with Custom Colors)}
            layout:
              title:
                text: Sunburst Plot with Custom Colors<br><sub>Custom Colors for Each Category</sub>
        ```

    === "Sunburst Insight with Custom Sizes"

        ```yaml
        models:
          - name: sunburst-data-sizes
            args:
              - echo
              - |
                labels,parents,values,size
                Total,,100,1
                A,Total,40,2
                B,Total,30,3
                C,Total,30,4
                D,A,10,5
                E,A,20,6
                F,B,10,7
        insights:
          - name: Sunburst Insight with Custom Sizes
            model: ${ref(sunburst-data-sizes)}
            columns:
              labels: ?{labels}
              parents: ?{parents}
              values: ?{values}
              size: ?{size}
            props:
              type: sunburst
              labels: ?{columns.labels}
              parents: ?{columns.parents}
              values: ?{columns.values}
              marker:
                line:
                  width: ?{columns.size}
                  color: black
        charts:
          - name: Sunburst Chart with Custom Sizes
            insights:
              - ${ref(Sunburst Insight with Custom Sizes)}
            layout:
              title:
                text: Sunburst Plot with Custom Sizes<br><sub>Custom Sizes for Each Segment</sub>
        ```

{% endraw %}

<!--end-->
