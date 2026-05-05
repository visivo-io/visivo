---
search:
  exclude: true
---

<!--start-->

## Overview

The `violin` insight type is used to create violin plots, visualizing the distribution of numerical data. Violin insights combine aspects of box plots and density plots to show the shape of the data distribution, including probability density. They are ideal for comparing distributions across categories.

You can customize the orientation, box overlay, points, and colors to represent your distribution data effectively.

!!! tip "Common Uses" - **Distribution Analysis**: Visualizing the distribution of numerical data, similar to box plots but with density information. - **Comparing Categories**: Comparing distributions across multiple categories. - **Outlier Detection**: Identifying outliers and distribution shape.

_**Check out the [Attributes](../../configuration/Insight/Props/Violin/#attributes) for the full set of configuration options**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple Violin Insight"

        ```yaml
        models:
          - name: violin-data
            args:
              - echo
              - |
                category,value
                A,23
                A,25
                A,27
                B,30
                B,35
                B,28
        insights:
          - name: Simple Violin Insight
            props:
              type: violin
              x: ?{${ref(violin-data).category}}
              y: ?{${ref(violin-data).value}}
        charts:
          - name: Simple Violin Chart
            insights:
              - ${ref(Simple Violin Insight)}
            layout:
              title:
                text: Simple Violin Plot<br><sub>Distribution of Values by Category</sub>
        ```

    === "Violin Insight with Box Overlay"

        ```yaml
        models:
          - name: violin-data-box
            args:
              - echo
              - |
                category,value
                A,23
                A,25
                A,27
                B,30
                B,35
                B,28
        insights:
          - name: Violin Insight with Box
            props:
              type: violin
              x: ?{${ref(violin-data-box).value}}
              y: ?{${ref(violin-data-box).category}}
              orientation: h
              box:
                visible: true
              points: "all"
              marker:
                symbol: "cross-dot"
        charts:
          - name: Violin Chart with Box
            insights:
              - ${ref(Violin Insight with Box)}
            layout:
              title:
                text: Violin Plot with Box Overlay<br><sub>Distribution with Box Plot and Data Points</sub>
        ```

    === "Violin Insight with Split Categories"

        ```yaml
        models:
          - name: violin-data-split
            args:
              - echo
              - |
                category,sub_category,value
                A,X,23
                A,Y,25
                A,Y,70
                A,Y,15
                A,X,27
                A,X,13
                A,X,21
                A,X,81
                B,X,30
                B,X,35
                B,X,4
                B,Y,35
                B,Y,6
                B,Y,5
                B,X,28
        insights:
          - name: Violin Insight Category X
            props:
              type: violin
              x: ?{${ref(violin-data-split).category}}
              y: ?{${ref(violin-data-split).value}}
              side: positive
            interactions:
              - filter: ?{${ref(violin-data-split).sub_category} = 'X'}
              - split: ?{${ref(violin-data-split).sub_category}}

          - name: Violin Insight Category Y
            props:
              type: violin
              x: ?{${ref(violin-data-split).category}}
              y: ?{${ref(violin-data-split).value}}
              side: negative
            interactions:
              - filter: ?{${ref(violin-data-split).sub_category} = 'Y'}
              - split: ?{${ref(violin-data-split).sub_category}}

        charts:
          - name: Violin Chart with Split Categories
            insights:
              - ${ref(Violin Insight Category Y)}
              - ${ref(Violin Insight Category X)}
            layout:
              title:
                text: Violin Plot with Split Categories<br><sub>Side-by-Side Comparison of Distributions</sub>
        ```

{% endraw %}

<!--end-->
