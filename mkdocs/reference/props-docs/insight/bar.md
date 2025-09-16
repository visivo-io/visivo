---
search:
  exclude: true
---

<!--start-->

## Overview

The **bar insight type** is used to display data as bars.

You have broad control over the appearance of bars via the `marker` attributes. You can set the fill color, opacity, pattern, line color, width, etc. You can also configure bars to display as either grouped or stacked.

!!! tip "Common Uses"

    - **Categorical Data Comparison**: Visualizing data across distinct categories (e.g., sales by product type).
    - **Grouped Bar Charts**: Comparing multiple series side by side (e.g., monthly sales by region).
    - **Stacked Bar Charts**: Showing cumulative data (e.g., revenue breakdown by product within a year).
    - **Horizontal Bar Charts**: Comparing data where horizontal labels are more readable (e.g., ranking of countries by population).
    - **Time-Series Data (Categorical)**: Displaying data changes over time with categories as the x-axis (e.g., yearly revenue growth by product).

_**See the [Attributes](../configuration/Insight/Props/Bar/#attributes) for the full set of configuration options.**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple Bar"

        Here's a really simple bar chart:
        ![](../../assets/example-charts/props/bar/simple-bar.png)

        ```yaml
        models:
          - name: monty-python-quest-data
            args:
              - curl
              - "https://raw.githubusercontent.com/visivo-io/data/refs/heads/main/monty_python_quests.csv"

        insights:
          - name: Count Enemies Encountered by Knight
            model: ${ref(monty-python-quest-data)}
            columns:
              enemy_encountered: ?{ enemy_encountered }
              y: ?{ count(*) }
              text: ?{ count(*) }
            props:
              type: bar
              x: ?{ columns.enemy_encountered }
              y: ?{ columns.y }
              text: ?{ columns.text }
            interactions:
              - sort: ?{ count(*) DESC }

        charts:
          - name: Count Times Enemy Was Encountered by Knight
            insights:
              - ${ref(Count Enemies Encountered by Knight)}
            layout:
              title:
                text: Bar<br><sub>The Number of Times an Enemy was Encountered on a Quest</sub>
        ```

    === "Split (Cohorted) Bar"

        Use the `interactions.split` key to create facets in your bar chart.
        ![](../../assets/example-charts/props/bar/cohorted-bar.png)

        ```yaml
        models:
          - name: monty-python-quest-data
            args:
              - curl
              - "https://raw.githubusercontent.com/visivo-io/data/refs/heads/main/monty_python_quests.csv"

        insights:
          - name: Count Enemies Encountered by Knight
            model: ${ref(monty-python-quest-data)}
            columns:
              enemy_encountered: ?{ enemy_encountered }
              y: ?{ count(*) }
              text: ?{ count(*) }
            props:
              type: bar
              x: ?{ columns.enemy_encountered }
              y: ?{ columns.y }
              text: ?{ columns.text }
            interactions:
              - split: ?{ person }
              - sort: ?{ count(*) DESC }

        charts:
          - name: Count Times Enemy Was Encountered by Knight
            insights:
              - ${ref(Count Enemies Encountered by Knight)}
            layout:
              title:
                text: Split Bar<br><sub>The Number of Times an Enemy was Encountered on a Quest by Knight</sub>
        ```

    === "Horizontal Split Bar"

        Sometimes it’s useful to view data horizontally.
        ![](../../assets/example-charts/props/bar/cohorted-horizontal-bar.png)

        ```yaml
        models:
          - name: monty-python-quest-data-h
            args:
              - curl
              - "https://raw.githubusercontent.com/visivo-io/data/refs/heads/main/monty_python_quests.csv"

        insights:
          - name: Count Enemies Encountered by Knight H
            model: ${ref(monty-python-quest-data-h)}
            columns:
              enemy_encountered: ?{ enemy_encountered }
              y: ?{ count(*) }
              text: ?{ count(*) }
            props:
              type: bar
              x: ?{ columns.enemy_encountered }
              y: ?{ columns.y }
              text: ?{ columns.text }
              textposition: outside
              textfont:
                size: 15
              orientation: h
            interactions:
              - split: ?{ person }
              - sort: ?{ count(*) DESC }

        charts:
          - name: Count Times Enemy Was Encountered by Knight H
            insights:
              - ${ref(Count Enemies Encountered by Knight H)}
            layout:
              title:
                text: Horizontal Split Bar<br><sub>The Number of Times an Enemy was Encountered on a Quest by Knight</sub>
              margin:
                l: 160
        ```

{% endraw %}

<!--end-->
