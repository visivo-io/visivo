---
search:
  exclude: true
---

<!--start-->

## Overview

The **box insight type** is used to display data as a box plot, which shows the distribution of data based on quartiles, medians, and potential outliers. It's useful for statistical visualizations, as it highlights data spread and central tendency while accounting for variability.

You can control various aspects of the plot, such as orientation, box and whisker styles, marker symbols, and points display. Additionally, you can show or hide outliers and configure hover labels for enhanced interaction.

!!! tip "Common Uses"

    - **Distribution Analysis**: Understanding the distribution of quest-related data.
    - **Outlier Detection**: Identifying outliers in quest performance metrics.
    - **Comparative Analysis**: Comparing the performance of knights on different quests.

_**See the [Attributes](../configuration/Insight/Props/Box/#attributes) for the full set of configuration options.**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple Box Plot"

        Here's a simple `box` plot showing the distribution of sample data:

        ![](../../assets/example-charts/props/box/simple-box-plot.png)

        ```yaml
        models:
          - name: sample-data
            args:
              - echo
              - |
                category,value
                A,23
                A,15
                A,18
                A,30
                A,28
                B,40
                B,35
                B,31
                B,25
                B,29

        insights:
          - name: Sample Box Plot
            model: ${ref(sample-data)}
            columns:
              category: ?{ category }
              value: ?{ value }
            props:
              type: box
              x: ?{ columns.category }
              y: ?{ columns.value }
              boxpoints: "all"
              jitter: 1
              pointpos: -1.1

        charts:
          - name: Simple Box Plot Chart
            insights:
              - ${ref(Sample Box Plot)}
            layout:
              title:
                text: Simple Box Plot<br><sub>Distribution of Values by Category</sub>
              xaxis:
                title:
                  text: "Category"
              yaxis:
                title:
                  text: "Value"
        ```

    === "Horizontal Box Plot"

        Here's a `box` plot showing the distribution of rewards earned by knights across different quests:

        ![](../../assets/example-charts/props/box/horizontal-box-plot.png)

        ```yaml
        models:
          - name: quest-rewards
            args:
              - curl
              - "https://raw.githubusercontent.com/visivo-io/data/refs/heads/main/monty_python_quests.csv"

        insights:
          - name: Rewards Distribution by Quest
            model: ${ref(quest-rewards)}
            columns:
              person: ?{ person }
              reward_gbp: ?{ reward_gbp }
            props:
              type: box
              y: ?{ columns.person }
              x: ?{ columns.reward_gbp }
              boxpoints: "all"
              jitter: 1
              pointpos: -1.1
              orientation: h

        charts:
          - name: Rewards Box Plot Chart
            insights:
              - ${ref(Rewards Distribution by Quest)}
            layout:
              title:
                text: Horizontal Box Plot<br><sub>GBP Rewards Earned Across Quests</sub>
              xaxis:
                title:
                  text: "Reward (GBP)"
        ```

    === "Cohorted Box Plot"

        In this example, we show how to display a box plot for the number of proclamations made across quests, split by person:

        ![](../../assets/example-charts/props/box/cohorted-box-plot.png)

        ```yaml
        models:
          - name: proclamations-data
            args:
              - curl
              - "https://raw.githubusercontent.com/visivo-io/data/refs/heads/main/monty_python_quests.csv"

        insights:
          - name: Proclamations Box Plot
            model: ${ref(proclamations-data)}
            columns:
              proclamations: ?{ proclamations_made }
              enemy: ?{ enemy_encountered }
              person: ?{ person }
            props:
              type: box
              y: ?{ columns.proclamations }
              x: ?{ columns.enemy }
            interactions:
              - split: ?{ columns.person }

        charts:
          - name: Proclamations Box Plot Chart
            insights:
              - ${ref(Proclamations Box Plot)}
            layout:
              title:
                text: Cohorted Box Plot<br><sub>Proclamations Made Across Quests by Enemy</sub>
              xaxis:
                title:
                  text: "Enemy"
              yaxis:
                title:
                  text: "Proclamations Made"
              boxmode: group
        ```

{% endraw %}

<!--end-->
