---
search:
  exclude: true
---

<!--start-->

## Overview

The `splom` insight type is used to create scatter plot matrices, which visualize pairwise relationships between multiple variables. It is ideal for exploring correlations, clusters, and patterns in multi-dimensional datasets.

You can customize marker size, color, and lines for each pair of variables in the matrix.

!!! tip "Common Uses" - **Pairwise Relationship Analysis**: Exploring multiple variable relationships simultaneously. - **Correlation Visualization**: Identifying patterns, clusters, or outliers in high-dimensional data. - **Multivariate Data Exploration**: Useful in statistics, machine learning, and data science.

_**Check out the [Attributes](../../configuration/Insight/Props/Splom/#attributes) for the full set of configuration options**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple Splom Insight"

        ```yaml
        models:
          - name: splom-data
            args:
              - curl
              - "-s"
              - "https://raw.githubusercontent.com/visivo-io/data/refs/heads/main/iris.csv"
        insights:
          - name: Simple Splom Insight
            props:
              type: splom
              dimensions:
                - label: "Sepal Length"
                  values: ?{${ref(splom-data).sepal_length}}
                - label: "Sepal Width"
                  values: ?{${ref(splom-data).sepal_width}}
                - label: "Petal Length"
                  values: ?{${ref(splom-data).petal_length}}
                - label: "Petal Width"
                  values: ?{${ref(splom-data).petal_width}}
              diagonal:
                visible: false
              showupperhalf: false

        charts:
          - name: Simple Splom Chart
            insights:
              - ${ref(Simple Splom Insight)}
            layout:
              title:
                text: Simple Splom Plot<br><sub>Scatter Plot Matrix of Four Variables & Three Cohorts</sub>
        ```

    === "Splom Insight with Custom Colors"

        ```yaml
        models:
          - name: splom-data-colors
            args:
              - echo
              - |
                var1,var2,var3,category
                1,2,3,A
                2,3,4,B
                3,4,5,A
                4,5,6,B
                5,6,7,A
        insights:
          - name: Splom Insight with Custom Colors
            props:
              type: splom
              dimensions:
                - label: "Variable 1"
                  values: ?{${ref(splom-data-colors).var1}}
                - label: "Variable 2"
                  values: ?{${ref(splom-data-colors).var2}}
                - label: "Variable 3"
                  values: ?{${ref(splom-data-colors).var3}}
              marker:
                color: ?{ case when ${ref(splom-data-colors).category} = 'A' then 'red' else 'green' end }
                size: 20
            interactions:
              - split: ?{ category }
        charts:
          - name: Splom Chart with Custom Colors
            insights:
              - ${ref(Splom Insight with Custom Colors)}
            layout:
              title:
                text: Splom Plot with Custom Colors<br><sub>Color-Coded Scatter Plot Matrix</sub>
        ```

    === "Splom Insight with Custom Marker Sizes"

        ```yaml
        models:
          - name: splom-data-sizes
            args:
              - echo
              - |
                var1,var2,var3,size
                1,2,3,10
                2,3,4,15
                3,4,5,20
                4,5,6,25
                5,6,7,30
        insights:
          - name: Splom Insight with Custom Sizes
            props:
              type: splom
              dimensions:
                - label: "Variable 1"
                  values: ?{${ref(splom-data-sizes).var1}}
                - label: "Variable 2"
                  values: ?{${ref(splom-data-sizes).var2}}
                - label: "Variable 3"
                  values: ?{${ref(splom-data-sizes).var3}}
              marker:
                size: ?{${ref(splom-data-sizes).size}}
            interactions:
              - split: ?{ size }
        charts:
          - name: Splom Chart with Custom Sizes
            insights:
              - ${ref(Splom Insight with Custom Sizes)}
            layout:
              title:
                text: Splom Plot with Custom Sizes<br><sub>Scatter Plot Matrix with Custom Marker Sizes</sub>
        ```

{% endraw %}

<!--end-->
