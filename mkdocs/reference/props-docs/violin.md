
## Overview

The `violin` trace type is used to create violin plots, which visualize the distribution of numerical data. Violin plots combine aspects of box plots and density plots to show the distribution of the data, including its probability density. They are ideal for comparing distributions between different categories.

You can customize the orientation, kernel density estimation, and colors to represent the distribution data effectively.

!!! tip "Common Uses"
    - **Distribution Analysis**: Visualizing the distribution of a dataset, similar to box plots but with additional information about the density of data.
    - **Comparing Categories**: Comparing the distribution of numerical data across different categories.
    - **Outlier Detection**: Identifying outliers and the shape of the data distribution.

_**Check out the [Attributes](../configuration/Trace/Props/Violin/#attributes) for the full set of configuration options**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple Violin Plot"

        Here's a simple `violin` plot showing the distribution of values for two categories:

        ![](../../assets/example-charts/props/violin/simple-violin.png)

        You can copy this code below to create this chart in your project:

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
        traces:
          - name: Simple Violin Plot
            model: ref(violin-data)
            props:
              type: violin
              x: query(category)
              y: query(value)
        charts:
          - name: Simple Violin Chart
            traces:
              - ref(Simple Violin Plot)
            layout:
              title:
                text: Simple Violin Plot<br><sub>Distribution of Values by Category</sub>
        ```

    === "Violin Plot with Custom Colors"

        This example demonstrates a `violin` plot with custom colors for each category:

        ![](../../assets/example-charts/props/violin/custom-colors-violin.png)

        Here's the code:

        ```yaml
        models:
          - name: violin-data-colors
            args:
              - echo
              - |
                category,value,color
                A,23,#1f77b4
                A,25,#1f77b4
                A,27,#1f77b4
                B,30,#ff7f0e
                B,35,#ff7f0e
                B,28,#ff7f0e
        traces:
          - name: Violin Plot with Custom Colors
            model: ref(violin-data-colors)
            props:
              type: violin
              x: query(category)
              y: query(value)
              marker:
                color: query(color)
        charts:
          - name: Violin Chart with Custom Colors
            traces:
              - ref(Violin Plot with Custom Colors)
            layout:
              title:
                text: Violin Plot with Custom Colors<br><sub>Customized Coloring for Categories</sub>
        ```

    === "Violin Plot with Split Categories"

        Here's a `violin` plot where the data is split by two categories, providing a side-by-side comparison of distributions:

        ![](../../assets/example-charts/props/violin/split-violin.png)

        Here's the code:

        ```yaml
        models:
          - name: violin-data-split
            args:
              - echo
              - |
                category,sub_category,value
                A,X,23
                A,Y,25
                A,X,27
                B,X,30
                B,Y,35
                B,X,28
        traces:
          - name: Violin Plot with Split Categories
            model: ref(violin-data-split)
            props:
              type: violin
              x: query(category)
              y: query(value)
              split: query(sub_category)
        charts:
          - name: Violin Chart with Split Categories
            traces:
              - ref(Violin Plot with Split Categories)
            layout:
              title:
                text: Violin Plot with Split Categories<br><sub>Split Violin Plot for Different Subcategories</sub>
        ```

{% endraw %}
