from typing import Optional
from pydantic import Field, ConfigDict
from visivo.models.base.named_model import NamedModel


class Metric(NamedModel):
    """
    A Metric represents a reusable aggregate calculation that can be referenced across charts.

    Metrics centralize business logic for key measurements, ensuring consistency and
    making updates easier. They can be defined at the model level (model-scoped) or
    at the project level (global metrics).

    !!! example
        === "Model-scoped Metric"
            ```yaml
            models:
              - name: orders
                sql: SELECT * FROM orders_table
                metrics:
                  - name: total_revenue
                    expression: "SUM(amount)"
                    description: "Total revenue from all orders"
            ```

        === "Global Metric (with multiple models)"
            ```yaml
            metrics:
              - name: revenue_per_user
                expression: "${ref(orders).total_revenue} / ${ref(users).total_users}"
                description: "Average revenue per user"
            ```
    """

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    expression: str = Field(
        ...,
        description="SQL aggregate expression for the metric. For model-scoped metrics, use direct SQL aggregates "
        "(e.g., 'SUM(amount)', 'COUNT(DISTINCT id)'). For global metrics, can reference other metrics "
        "or fields using ${ref(model).field} or ${ref(metric_name)} syntax. "
        "Must be a valid aggregate function and cannot contain raw columns outside of aggregates.",
    )

    description: Optional[str] = Field(
        None, description="Human-readable description of what this metric represents."
    )
