from typing import Optional
import re
from pydantic import Field, ConfigDict, field_validator, PrivateAttr
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

    _parent_name: Optional[str] = PrivateAttr(default=None)

    def set_parent_name(self, value: str):
        """Set the parent model name for nested metrics."""
        self._parent_name = value

    # TODO: Need to find a way to make names globally unique without creating confusion maybe something like alias should be set in place on model scoped metrics and then name can be computed from the model and alias?
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

        For nested metrics (those defined under a model), this returns a reference to the parent model.
        For standalone metrics (project-level), this extracts model/metric references from the expression.

        Returns:
            List of ref() strings for dependencies
        """
        children = []

        # Check if this is a nested metric (has a parent_name set)
        if hasattr(self, "_parent_name") and self._parent_name:
            # Nested metric - reference the parent model only
            children.append(f"ref({self._parent_name})")
        else:
            # Standalone metric - extract references from expression
            from visivo.query.patterns import extract_ref_components

            if self.expression:
                ref_components = extract_ref_components(self.expression)

                # Convert to ref() format for DAG
                for model_or_metric_name, field_name in ref_components:
                    children.append(f"ref({model_or_metric_name})")

        return children
