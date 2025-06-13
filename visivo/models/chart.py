from typing import List, Optional
from pydantic import Field

from visivo.models.base.selector_model import SelectorModel
from visivo.models.base.named_model import NamedModel
from visivo.models.base.parent_model import ParentModel
from visivo.models.base.base_model import generate_ref_field
from visivo.models.trace import Trace
from visivo.models.trace_props.layout import Layout


class Chart(SelectorModel, NamedModel, ParentModel):
    """
    ## Overview
    Charts enable you to combine one or more [traces](../Trace/) with [layout](./Layout/) configurations _(titles, axis labels, ect.)_.

    !!! tip

        You can add traces of **different types** to a chart. For example, you may want to display an [`indicator`](../Trace/Props/Indicator/)
        on top of a [`bar`](../Trace/Props/Bar/) to show how what the bars add up to.

    You can also configure interactivity in your charts by setting up a  [`selector`](../Selector/).

    ## Common Configurations

    ### Single Trace

    This is the most common and simplest chart setup. You will use this when you want to display a single trace.
    !!! example "Single Trace"

        ??? note "Code"

            ``` yaml
            models:
              - name: Array of Numbers
                args: ["curl", "-s", "https://raw.githubusercontent.com/visivo-io/data/refs/heads/main/y_values.csv"]

            traces:
              - name: Simple Scatter
                model: ref(Array of Numbers)
                props:
                  type: scatter
                  x: ?{ ln(numbers_column)}
                  y: ?{numbers_column}
                  mode: markers
                  marker:
                    size: ?{ abs(sin(exp(numbers_column) - 5)*100) }
                    opacity: ?{ abs(cos(exp(numbers_column) - 5)*100)/100 }
                filters:
                  - ?{ numbers_column < 400 }
                order_by:
                  - ?{numbers_column}

            charts:
              - name: Single Trace Chart
                traces:
                  - ref(Simple Scatter)
                layout:
                  title:
                    text: "Single Trace"
            ```
        ![](../../../assets/example-charts/single-trace.png)
    ### Duel Axis
    When you want to display two different types of data on the same chart, duel axis can come in handy.
    !!! tip

        You can actually create a third, and fourth axis ([see plotly docs](https://plotly.com/javascript/multiple-axes/#multiple-y-axes)), however, we do not recommended using more than two yaxes.

    Here's a working example that you can copy and paste into your project:
    !!! example "Duel Y Axes"

        ??? note "Code"

            ``` yaml
            models:
              - name: Series of Numbers
                args: ["curl", "-s", "https://raw.githubusercontent.com/visivo-io/data/refs/heads/main/y_values.csv"]

            traces:
              - name: Yaxis Trace
                model: ref(Series of Numbers)
                props:
                  type: bar
                  y: ?{numbers_column}
                  marker:
                    color: '#713B57'
                    opacity: .7
                order_by:
                  - ?{numbers_column}

              - name: Yaxis2 Trace
                model: ref(Series of Numbers)
                props:
                  type: scatter
                  y: ?{ (500 -  numbers_column) }
                  yaxis: 'y2'
                  line:
                    shape: spline
                    smoothing: .1
                    color: orange

                order_by:
                  - ?{numbers_column}

            charts:
              - name: Duel Axis
                traces:
                  - ref(Yaxis2 Trace)
                  - ref(Yaxis Trace)
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

    ### Position Traces with Domains

    You can use domains to position traces on your chart. This is useful when you want to display multiple traces on your chart.
    The `domain` attribute in the trace props enables you to position your traces relative to 0,0 coordinates of the chart.

    Here's some working examples that you can copy and paste into your project:
    !!! example "Trend Line + Multiple Indicators"

        ??? note "Code"

            ``` yaml
            models:
              - name: Numbers From Remote CSV
                args: ["curl", "-s", "https://raw.githubusercontent.com/visivo-io/data/refs/heads/main/y_values.csv"]

            traces:
              - name: Line Trace
                model: ref(Numbers From Remote CSV)
                props:
                  type: scatter
                  y: ?{numbers_column}
                  line:
                    shape: spline
                    color: orange

              - name: Average Value
                model: ref(Numbers From Remote CSV)
                columns:
                  avg_numbers_column: avg(numbers_column)
                props:
                  type: indicator
                  value: column(avg_numbers_column)[0]
                  number:
                    font:
                      size: 35
                    suffix: " avg"
                  domain:
                    y: [0, .7]
                    x: [.5, 1]

              - name: Total Value
                model: ref(Numbers From Remote CSV)
                columns:
                  sum_numbers_column: sum(numbers_column)
                props:
                  type: indicator
                  value: column(sum_numbers_column)[0]
                  number:
                    font:
                      size: 35
                    suffix: " sum"
                  domain:
                    y: [.5, 1]
                    x: [.2, .5]

            charts:
              - name: Big Number Over Line Chart
                traces:
                  - ref(Average Value)
                  - ref(Total Value)
                  - ref(Line Trace)
                layout:
                  title:
                    text: "Indicator + Scatter Plot"
            ```
        ![](../../../assets/example-charts/position-traces-with-domains.png)

    """

    def child_items(self):
        return self.traces + [self.selector]

    traces: List[generate_ref_field(Trace)] = Field(
        [],
        description="A list of trace either written in line in the chart called using the ref() function.",
    )

    layout: Optional[Layout] = Field(
        None,
        description="A layout configuration that must adhere to the layout.schema.json file.",
    )
