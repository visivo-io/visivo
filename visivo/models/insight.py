from typing import Any, Dict, Literal, Optional, List
from pydantic import BaseModel, Field
from visivo.models.fields import QueryOrStringField
from visivo.models.models.fields import ModelRefField
from visivo.models.trace_props.trace_props import TraceProps
from visivo.models.base.named_model import NamedModel
from visivo.models.base.parent_model import ParentModel
from visivo.models.trace_columns import TraceColumns


class InsightInteraction(BaseModel):
    """
    Represents a client-side interaction that can be applied to insight data.
    """

    filter: Optional[QueryOrStringField] = Field(
        None, description="Filter expression to apply to the data on the client side"
    )
    split: Optional[QueryOrStringField] = Field(
        None, description="Column or expression to split data into multiple traces"
    )
    sort: Optional[QueryOrStringField] = Field(
        None, description="Column or expression to sort data by"
    )


class Insight(NamedModel, ParentModel):
    """
    Insights replace traces in Interactivity 2.0, providing a cleaner separation
    between server-side data preparation and client-side interactivity.

    Unlike traces, insights generate flat JSON data structures and support
    client-side interactions through DuckDB WASM execution.

    !!! example
        ```yaml
        insights:
          - name: revenue-by-month
            description: "Monthly revenue trends"
            model: ${ref(orders_model)}
            columns:
              region: ?{ region }
              category: ?{ category }
            props:
              type: scatter
              mode: lines+markers
              x: ?{ date_trunc('month', created_at) }
              y: ?{ sum(amount) }
            interactions:
              - filter: ?{ month >= ${ref(date-range).start} }
              - split: ?{ region }
              - sort: ?{ month ASC }
        ```
    """

    name: str = Field(description="The unique name of the insight across the entire project.")

    model: ModelRefField = Field(
        description="The model or model ref that Visivo should use to build the insight."
    )

    description: Optional[str] = Field(
        None, description="Optional description of what this insight represents."
    )

    columns: Optional[TraceColumns] = Field(
        None,
        description="Additional data columns to include that can be used for client-side interactions.",
    )

    props: TraceProps = Field(
        description="Visualization properties that define how the insight should be displayed."
    )

    interactions: Optional[List[InsightInteraction]] = Field(
        None, description="Client-side interactions that can be applied to the insight data."
    )

    def child_items(self):
        """Return child items for DAG construction"""
        children = [self.model]
        return children
