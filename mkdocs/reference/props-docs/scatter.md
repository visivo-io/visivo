
## Overview

The `scatter` trace type is used to create scatter plots, which visualize data points based on two numerical variables. Scatter plots are widely used for analyzing relationships between variables, identifying trends, and detecting outliers.

You can customize the marker size, color, and add lines to connect the points to represent the data in various forms like scatter plots, line charts, and more.

!!! tip "Common Uses"
    - **Relationship Analysis**: Exploring the relationship between two variables.
    - **Trend Detection**: Identifying trends or patterns in data.
    - **Outlier Identification**: Spotting outliers in data distributions.

_**Check out the [Attributes](../configuration/Trace/Props/Scatter/#attributes) for the full set of configuration options**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple Scatter Plot"

        Here's a simple `scatter` plot showing data points on a 2D plane:

        ![](../../assets/example-charts/props/scatter/simple-scatter.png)

        You can copy this code below to create this chart in your project:

        ```yaml
        models:
          - name: scatter-data
            args:
              - echo
              - |
                x,y
                1,10
                2,20
                3,15
                4,25
                5,30
        traces:
          - name: Simple Scatter Plot
            model: ref(scatter-data)
            props:
              type: scatter
              x: query(x)
              y: query(y)
              mode: "markers"
        charts:
          - name: Simple Scatter Chart
            traces:
              - ref(Simple Scatter Plot)
            layout:
              title:
                text: Simple Scatter Plot<br><sub>2D Data Points</sub>
        ```

    === "Scatter Plot with Lines"

        This example demonstrates a `scatter` plot with lines connecting the data points to show trends:

        ![](../../assets/example-charts/props/scatter/lines-scatter.png)

        Here's the code:

        ```yaml
        models:
          - name: scatter-data-lines
            args:
              - echo
              - |
                x,y
                1,5
                2,10
                3,8
                4,15
                5,12
        traces:
          - name: Scatter Plot with Lines
            model: ref(scatter-data-lines)
            props:
              type: scatter
              x: query(x)
              y: query(y)
              mode: "lines+markers"
        charts:
          - name: Scatter Chart with Lines
            traces:
              - ref(Scatter Plot with Lines)
            layout:
              title:
                text: Scatter Plot with Lines<br><sub>Connecting Data Points with Lines</sub>
        ```

    === "Scatter Plot with Custom Marker Sizes and Colors"

        Here's a `scatter` plot with custom marker sizes and colors, giving more visual weight to each data point:

        ![](../../assets/example-charts/props/scatter/custom-markers-scatter.png)

        Here's the code:

        ```yaml
        models:
          - name: scatter-data-custom
            args:
              - echo
              - |
                x,y,size,color
                1,5,10,#1f77b4
                2,10,15,#ff7f0e
                3,8,20,#2ca02c
                4,15,25,#d62728
                5,12,30,#9467bd
        traces:
          - name: Scatter Plot with Custom Markers
            model: ref(scatter-data-custom)
            props:
              type: scatter
              x: query(x)
              y: query(y)
              mode: "markers"
              marker:
                size: query(size)
                color: query(color)
        charts:
          - name: Scatter Chart with Custom Markers
            traces:
              - ref(Scatter Plot with Custom Markers)
            layout:
              title:
                text: Scatter Plot with Custom Markers<br><sub>Custom Sizes and Colors for Data Points</sub>
        ```

{% endraw %}
