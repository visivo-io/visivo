from typing import List, Optional, TypeAlias
from pydantic import Field

from visivo.models.base.named_model import NamedModel
from visivo.models.base.parent_model import ParentModel
from visivo.models.base.base_model import generate_ref_field
from visivo.models.props.layout import Layout
from visivo.models.insight import Insight

InsightRef: TypeAlias = generate_ref_field(Insight)


class Chart(NamedModel, ParentModel):
    """
    ## Overview
    Charts enable you to combine one or more [insights](../Insight/) with [layout](./Layout/) configurations _(titles, axis labels, ect.)_.

    !!! tip

        You can add insights of **different types** to a chart. For example, you may want to display an [`indicator`](../Insight/Props/Indicator/)
        on top of a [`bar`](../Insight/Props/Bar/) to show how what the bars add up to.

    You can configure interactivity in your charts by wiring up [`inputs`](../Inputs/SingleSelectInput/).

    ## Common Configurations

    ### Single Insight

    This is the most common and simplest chart setup — one insight wrapped in chart layout.
    !!! example "Single Insight"

        ??? note "Code"

            ``` yaml
            models:
              - name: Array of Numbers
                args: ["curl", "-s", "https://raw.githubusercontent.com/visivo-io/data/refs/heads/main/y_values.csv"]

            insights:
              - name: Simple Scatter
                props:
                  type: scatter
                  x: ?{ ln(${ref(Array of Numbers).numbers_column}) }
                  y: ?{${ref(Array of Numbers).numbers_column}}
                  mode: markers
                  marker:
                    size: ?{ abs(sin(exp(${ref(Array of Numbers).numbers_column}) - 5)*100) }
                    opacity: ?{ abs(cos(exp(${ref(Array of Numbers).numbers_column}) - 5)*100)/100 }
                interactions:
                  - filter: ?{${ref(Array of Numbers).numbers_column} < 400}
                  - sort: ?{${ref(Array of Numbers).numbers_column}}

            charts:
              - name: Single Insight Chart
                insights:
                  - ${ref(Simple Scatter)}
                layout:
                  title:
                    text: "Single Insight"
            ```
    ### Dual Axis
    When you want to display two different types of data on the same chart, dual axis can come in handy.
    !!! tip

        You can create a third or fourth axis ([see plotly docs](https://plotly.com/javascript/multiple-axes/#multiple-y-axes)), however, we do not recommend using more than two yaxes.

    !!! example "Dual Y Axes"

        ??? note "Code"

            ``` yaml
            models:
              - name: Series of Numbers
                args: ["curl", "-s", "https://raw.githubusercontent.com/visivo-io/data/refs/heads/main/y_values.csv"]

            insights:
              - name: Yaxis Bars
                props:
                  type: bar
                  y: ?{${ref(Series of Numbers).numbers_column}}
                  marker:
                    color: '#713B57'
                    opacity: .7
                interactions:
                  - sort: ?{${ref(Series of Numbers).numbers_column}}

              - name: Yaxis2 Line
                props:
                  type: scatter
                  y: ?{ (500 - ${ref(Series of Numbers).numbers_column}) }
                  yaxis: 'y2'
                  line:
                    shape: spline
                    smoothing: .1
                    color: orange
                interactions:
                  - sort: ?{${ref(Series of Numbers).numbers_column}}

            charts:
              - name: Dual Axis
                insights:
                  - ${ref(Yaxis2 Line)}
                  - ${ref(Yaxis Bars)}
                layout:
                  title:
                    text: "Dual Axis"
                  legend:
                    orientation: "h"
                  yaxis:
                    title:
                      text: "yaxis title"
                      font:
                        size: 18
                        color: '#713B57'
                  yaxis2:
                    title:
                      text: "yaxis2 title"
                      font:
                        size: 18
                        color: orange
                    side: right
                    overlaying: 'y'
                    anchor: 'y'
                    showgrid: false

            ```
        ![](../../../assets/example-charts/duel-axis.png)

    ### Position Insights with Domains

    You can use domains to position insights on your chart. This is useful when you want to display multiple insights side-by-side on a single chart.
    The `domain` attribute in the insight props lets you position the insight relative to the chart's 0,0 coordinates.

    !!! example "Trend Line + Multiple Indicators"

        ??? note "Code"

            ``` yaml
            models:
              - name: Numbers From Remote CSV
                args: ["curl", "-s", "https://raw.githubusercontent.com/visivo-io/data/refs/heads/main/y_values.csv"]

            insights:
              - name: Line
                props:
                  type: scatter
                  y: ?{${ref(Numbers From Remote CSV).numbers_column}}
                  line:
                    shape: spline
                    color: orange

              - name: Average Value
                props:
                  type: indicator
                  value: ?{ avg(${ref(Numbers From Remote CSV).numbers_column}) }[0]
                  number:
                    font:
                      size: 35
                    suffix: " avg"
                  domain:
                    y: [0, .7]
                    x: [.5, 1]

              - name: Total Value
                props:
                  type: indicator
                  value: ?{ sum(${ref(Numbers From Remote CSV).numbers_column}) }[0]
                  number:
                    font:
                      size: 35
                    suffix: " sum"
                  domain:
                    y: [.5, 1]
                    x: [.2, .5]

            charts:
              - name: Big Number Over Line Chart
                insights:
                  - ${ref(Average Value)}
                  - ${ref(Total Value)}
                  - ${ref(Line)}
                layout:
                  title:
                    text: "Indicator + Scatter Plot"
            ```

    """

    def child_items(self):
        """Return child items for DAG construction"""
        return self.insights

    insights: List[InsightRef] = Field(
        [],
        description="A list of insights either written in line in the chart or called using the ${ ref() } function.",
    )

    layout: Optional[Layout] = Field(
        None,
        description="A layout configuration that must adhere to the layout.schema.json file.",
    )
