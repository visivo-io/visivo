---
search:
  exclude: true
---

<!--start-->

## Overview

The `histogram` insight type is used to create histograms, which represent the distribution of numerical data by dividing the data into bins and counting the number of occurrences in each bin. Histograms are great for understanding data distribution, variability, and patterns.

You can customize bin size, orientation, and colors to fit your data. Histograms are especially useful in statistical analysis, data science, and exploratory data analysis.

!!! tip "Common Uses" - **Data Distribution**: Visualizing how data points are distributed across different ranges. - **Frequency Analysis**: Showing the frequency of values within specific intervals. - **Statistical Summaries**: Understanding the spread, central tendency, and outliers in data.

_**Check out the [Attributes](../configuration/Insight/Props/Histogram/#attributes) for the full set of configuration options**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple Histogram Insight"

        Here's a simple `histogram` insight showing the distribution of data across different bins:

        ![](../../assets/example-charts/props/histogram/simple-histogram.png)

        ```yaml
        models:
          - name: histogram-data
            args:
              - echo
              - |
                value
                10
                20
                15
                10
                5
                25
                30
                15
                20
                10
        insights:
          - name: Simple Histogram Insight
            model: ${ref(histogram-data)}
            columns:
              value: ?{value}
            props:
              type: histogram
              x: ?{columns.value}
              nbinsx: 5
              marker:
                color: "#17becf"
        charts:
          - name: Simple Histogram Chart
            insights:
              - ${ref(Simple Histogram Insight)}
            layout:
              title:
                text: Simple Histogram Plot<br><sub>Data Distribution Across Bins</sub>
              xaxis:
                title:
                  text: "Value"
              yaxis:
                title:
                  text: "Count"
              bargap: 0.05
        ```

    === "Horizontal Histogram Insight"

        This example shows a horizontal `histogram` insight, where the bins are displayed along the y-axis:

        ![](../../assets/example-charts/props/histogram/horizontal-histogram.png)

        ```yaml
        models:
          - name: histogram-data-horizontal
            args:
              - echo
              - |
                value
                1
                3
                2
                5
                4
                3
                3
                3
                3
                4
                1
                3
                4
                3
                3
                4
                1
                2
                3
                5
                2
                3
                4
        insights:
          - name: Horizontal Histogram Insight
            model: ${ref(histogram-data-horizontal)}
            columns:
              value: ?{value}
            props:
              type: histogram
              y: ?{columns.value}
              nbinsy: 2
              marker:
                color: "#ff7f0e"
              orientation: h
        charts:
          - name: Horizontal Histogram Chart
            insights:
              - ${ref(Horizontal Histogram Insight)}
            layout:
              title:
                text: Horizontal Histogram Plot<br><sub>Data Distribution in a Horizontal Format</sub>
              yaxis:
                title:
                  text: "Value"
              xaxis:
                title:
                  text: "Count"
              bargap: 0.05
        ```

    === "Stacked Histogram Insight"

        Here's a stacked `histogram` insight showing the distribution of two different datasets stacked on top of each other:

        ![](../../assets/example-charts/props/histogram/stacked-histogram.png)

        ```yaml
        models:
          - name: histogram-data-stacked
            args:
              - echo
              - |
                group,value
                A,1
                A,2
                A,2
                A,3
                B,3
                B,4
                B,5
                B,5
                B,6
        insights:
          - name: Histogram Groups
            model: ${ref(histogram-data-stacked)}
            cohort_on: '"group"'
            columns:
              value: ?{value}
              group: ?{group}
              color: |
                case
                  when "group" = 'A' then '#1f77b4'
                  when "group" = 'B' then '#ff7f0e'
                  else null
                end
            props:
              type: histogram
              x: ?{columns.value}
              marker:
                color: ?{columns.color}
        charts:
          - name: Stacked Histogram Chart
            insights:
              - ${ref(Histogram Groups)}
            layout:
              title:
                text: Stacked Histogram Chart<br><sub>Data Distribution for Two Groups</sub>
              xaxis:
                title:
                  text: "Value"
              yaxis:
                title:
                  text: "Count"
              barmode: "stack"
              bargap: .05
        ```

{% endraw %}

<!--end-->
