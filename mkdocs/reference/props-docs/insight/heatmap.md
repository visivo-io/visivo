---
search:
  exclude: true
---

<!--start-->

## Overview

The `heatmap` insight type is used to create heatmaps, which represent data using a grid where values are mapped to colors. Heatmaps are commonly used to visualize matrix-like data, such as correlations, intensity, or frequency distributions.

You can customize the colorscale, gridlines, and other properties to fit your data and visualization needs.

!!! tip "Common Uses" - **Correlation Matrices**: Visualizing relationships between variables. - **Frequency Distributions**: Showing how frequently data points occur across categories. - **Geospatial Heatmaps**: Visualizing the density or intensity of occurrences in a 2D space.

_**Check out the [Attributes](../configuration/Insight/Props/Heatmap/#attributes) for the full set of configuration options**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple Heatmap Insight"

        Here's a simple `heatmap` insight showing data values on a 2D grid:

        ![](../../assets/example-charts/props/heatmap/simple-heatmap.png)

        ```yaml
        models:
          - name: heatmap-data
            args:
              - echo
              - |
                x,y,z
                A,1,5
                A,2,10
                A,3,15
                B,1,20
                B,2,25
                B,3,30
                C,1,35
                C,2,40
                C,3,45
        insights:
          - name: Simple Heatmap Insight
            model: ${ref(heatmap-data)}
            columns:
              x: ?{x}
              y: ?{y}
              z: ?{z}
            props:
              type: heatmap
              x: ?{columns.x}
              y: ?{columns.y}
              z: ?{columns.z}
              colorscale: "Viridis"
        charts:
          - name: Simple Heatmap Chart
            insights:
              - ${ref(Simple Heatmap Insight)}
            layout:
              title:
                text: Simple Heatmap Plot<br><sub>Data Visualization on a 2D Grid</sub>
              xaxis:
                title:
                  text: "X Axis"
              yaxis:
                title:
                  text: "Y Axis"
        ```

    === "Heatmap with Categorical Axis"

        ![](../../assets/example-charts/props/heatmap/categorical-heatmap.png)

        ```yaml
        models:
          - name: heatmap-data-custom
            args:
              - echo
              - |
                x,y,z
                Low,A,0.1
                Low,B,0.2
                Low,C,0.3
                Medium,A,0.4
                Medium,B,0.5
                Medium,C,0.6
                High,A,0.7
                High,B,0.8
                High,C,0.9
        insights:
          - name: Heatmap with Custom Colorscale
            model: ${ref(heatmap-data-custom)}
            columns:
              x: ?{x}
              y: ?{y}
              z: ?{z}
            props:
              type: heatmap
              x: ?{columns.x}
              y: ?{columns.y}
              z: ?{columns.z}
              zmin: 0
              zmax: 1
        charts:
          - name: Heatmap Chart with Categorical Axis
            insights:
              - ${ref(Heatmap with Custom Colorscale)}
            layout:
              title:
                text: Heatmap Chart with Categorical Axis<br><sub>Categorical Data</sub>
              xaxis:
                title:
                  text: "Priority Level"
                type: "category"
              yaxis:
                title:
                  text: "Category"
                type: "category"
        ```

    === "Heatmap with Text Annotations"

        ![](../../assets/example-charts/props/heatmap/text-annoations.png)

        ```yaml
        models:
          - name: heatmap-data-annotations
            args:
              - echo
              - |
                x,y,z
                Q1,2019,100
                Q2,2019,150
                Q3,2019,200
                Q4,2019,250
                Q1,2020,300
                Q2,2020,350
                Q3,2020,400
                Q4,2020,450
        insights:
          - name: Heatmap with Text Annotations
            model: ${ref(heatmap-data-annotations)}
            columns:
              x: ?{x}
              y: ?{y}
              z: ?{z}
            props:
              type: heatmap
              x: ?{columns.x}
              y: ?{columns.y}
              z: ?{columns.z}
              text: ?{columns.z}
              texttemplate: "%{text}"
              textfont:
                size: 12
              colorscale: "Blues"
        charts:
          - name: Heatmap Chart with Text Annotations
            insights:
              - ${ref(Heatmap with Text Annotations)}
            layout:
              title:
                text: Heatmap with Text Annotations<br><sub>Data Values Displayed on Each Cell</sub>
              xaxis:
                title:
                  text: "Quarter"
              yaxis:
                title:
                  text: "Year"
        ```

{% endraw %}

<!--end-->
