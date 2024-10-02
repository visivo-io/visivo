from typing import Any, List, Optional
from pydantic import Field, model_validator

from visivo.models.base.selector_model import SelectorModel
from .base.named_model import NamedModel
from .base.parent_model import ParentModel
from .base.base_model import generate_ref_field
from .trace import Trace
from .trace_props.layout import Layout


class Chart(SelectorModel, NamedModel, ParentModel):
    """
    Charts enable you to combine one or more [traces](../Trace/) with [layout](./Layout/) configurations _(titles, axis labels, ect.)_. 

    !!! tip 

        You can add traces of **different types** to a chart. For example, you may want to display an [`indicator`](../Trace/Props/Indicator/) 
        on top of a [`bar`](../Trace/Props/Bar/) to show how what the bars add up to.
  
    You can also configure interactivity in your charts by setting up a  [`selector`](../Selector/). 

    ## Common Setups

    ### Single Trace

    This is the most common and simplest chart setup. You will use this when you want to display a single trace. Typically you will also 
    want to configure chart and axis titles as well. 
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

    ### Duel Yaxis

    ### Position Traces with Domains

    ### Single Select Traces
    
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
