import re
from typing import Any, Optional, List
from pydantic import Field, model_validator
from visivo.models.insight_columns import InsightColumns
from visivo.models.interaction import InsightInteraction
from visivo.models.models.fields import ModelRefField
from visivo.models.props.insight_props import InsightProps
from visivo.models.base.named_model import NamedModel
from visivo.models.base.parent_model import ParentModel


class Insight(NamedModel, ParentModel):
    """
    The **Insight** is the central visualization object in Visivo Interactivity 2.0.

    Insights replace **Traces**, providing a cleaner separation between
    **server-side data preparation** and **client-side interactivity**.
    Unlike traces, insights generate flat JSON structures that can be manipulated
    in the browser for responsive dashboards.

    ## Why Insights?
    * **Simpler Mental Model** – No more mixing cohort logic or trace naming rules
    * **Interactive by Default** – Client-side filtering, splitting, and sorting
    * **Reusable** – Insights can appear in multiple charts & tables
    * **Fast** – Pre-computed data cached server-side, interactions run locally

    ## Core Components
    - **model**: The SQL model or reference that defines the server-side dataset
    - **columns**: Extra fields exposed for client-side interactions
    - **props**: Visualization config (chart type, axes, encodings)
    - **interactions**: Client-side transformations (filter, split, sort)

    ## Example
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

    In the example above:
    - **Server-side**: Revenue is aggregated by month.
    - **Client-side**: A date-range filter and region split are applied instantly in the browser.

    ## Interactions
    Interactions define how users can manipulate data locally:
    - **Filter**: Subset rows by conditions (`WHERE` logic)
    - **Split**: Break a single insight into multiple series (replaces `cohort_on`)
    - **Sort**: Order data dynamically

    Example:
    ```yaml
    interactions:
      - filter: ?{ sales_amount > 1000 AND region = ${ref(sales-region).value} }
      - split: ?{ product_category }
      - sort: ?{ date DESC, amount ASC }
    ```

    ## Migration from Traces
    - `cohort_on` → `split` interaction
    - `columns` → strictly for client-side usage (not props)
    - Flat JSON output → easier integration with DuckDB WASM & UI components
    """

    name: str = Field(description="The unique name of the insight across the entire project.")

    model: ModelRefField = Field(
        description="The model or model ref that Visivo should use to build the insight."
    )

    description: Optional[str] = Field(
        None, description="Optional description of what this insight represents."
    )

    columns: Optional[InsightColumns] = Field(
        None,
        description="Additional data columns to include that can be used for client-side interactions.",
    )

    props: InsightProps = Field(
        None,
        description="Visualization properties that define how the insight should be displayed.",
    )

    interactions: Optional[List[InsightInteraction]] = Field(
        None, description="Client-side interactions that can be applied to the insight data."
    )

    def child_items(self):
        """Return child items for DAG construction"""
        children = [self.model]
        return children

    @model_validator(mode="before")
    @classmethod
    def validate_column_refs(cls, data: Any):
        if isinstance(data, str):
            return data
        columns, props = (data.get("columns"), data.get("props"))
        if columns is None or props is None:
            return data

        columnKeys = list(columns.keys())
        pattern = r"column\(([^\)]+)\)"
        for value in props.values():
            match = re.search(pattern, str(value))
            if match:
                value = match.group(1)
                if value not in columnKeys:
                    raise ValueError(
                        f"referenced column name '{value}' is not in columns definition"
                    )

        return data
