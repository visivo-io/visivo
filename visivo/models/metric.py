from typing import Optional
import re
from pydantic import Field, ConfigDict, field_validator
from visivo.models.base.named_model import NamedModel
from visivo.models.base.parent_model import ParentModel


class Metric(NamedModel, ParentModel):
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

    @field_validator("name")
    @classmethod
    def validate_sql_identifier(cls, v: Optional[str]) -> Optional[str]:
        """Validate that the metric name is a valid identifier."""
        if v is None:
            return v

        # Use regex to validate: alphanumeric and underscores only, no whitespace or dots
        if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", v):
            raise ValueError(
                f"Metric name '{v}' must contain only letters, numbers, and underscores, "
                "and cannot start with a number."
            )

        return v

    def child_items(self):
        """
        Return child items for DAG construction.

        Extracts model and metric references from the metric expression using ${ref(...)} syntax.
        This allows the DAG to properly track dependencies between metrics and the models/metrics they reference.

        Returns:
            List of ref() strings for models and metrics referenced in the expression
        """
        from visivo.query.patterns import extract_ref_components

        children = []

        # Extract all ${ref(model).field} and ${ref(metric)} references from expression
        if self.expression:
            ref_components = extract_ref_components(self.expression)

            # Convert to ref() format for DAG
            # Each component is (model_or_metric_name, field_name)
            for model_or_metric_name, field_name in ref_components:
                if field_name:
                    # This is a model.field reference
                    children.append(f"ref({model_or_metric_name})")
                else:
                    # This is a metric reference (no field)
                    children.append(f"ref({model_or_metric_name})")

        return children
