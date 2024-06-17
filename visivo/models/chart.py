from typing import Any, List, Optional
from pydantic import Field, model_validator

from visivo.models.base.selector_model import SelectorModel
from .base.named_model import NamedModel
from .base.parent_model import ParentModel
from .base.base_model import generate_ref_field
from .trace import Trace
from .trace_props import Layout
from typing_extensions import Annotated


class Chart(SelectorModel, NamedModel, ParentModel):
    """
    Charts are used to house traces and set up layout configurations (titles, axis labels, ect.).

    A chart contains 1 to many traces. This is really useful if you want to combine traces that are on different date grains, bars and lines, or even overlay big numbers over line chart to show the current value and the trend.

    The layout is where you define static labels like titles but also where you can set interactive elements like buttons and drop downs. With those interactive elements you can toggle between traces or cohorts on traces.
    ``` yaml
    chart:
      name: a-chart-name
      traces:
        - ref(a-trace-name)
      layout:
        title: 'Aggregated Fibonacci'
        yaxis:
          title: 'Widgets Sold' #Describe the data in your y axis
        xaxis:
          title: 'Week' #Describe the data in your x axis
        stack: False
    ```
    """

    def child_items(self):
        return self.traces + [self.selector]

    traces: List[generate_ref_field(Trace)] = Field(
        [],
        description="A list of trace either written in line in the chart called using the ref() function.",
    )

    layout: Optional[Layout] = Field(
        None,
        description="The layout attribute of the chart accepts any valid plotly layout configurations.",
    )

    @property
    def trace_objs(self) -> List[Trace]:
        return list(filter(Trace.is_obj, self.traces))

    @property
    def trace_refs(self) -> List[str]:
        return list(filter(Trace.is_ref, self.traces))


