from typing import Optional
from pydantic import Field, ConfigDict, field_validator
from visivo.models.base.named_model import NamedModel
import sqlglot


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

    @field_validator("name")
    @classmethod
    def validate_sql_identifier(cls, v: Optional[str]) -> Optional[str]:
        """Validate that the metric name is a valid SQL identifier."""
        if v is None:
            return v

        # Check for dangerous SQL patterns
        if ";" in v or "--" in v or "/*" in v or "*/" in v:
            raise ValueError(f"Metric name '{v}' contains potentially dangerous SQL characters.")

        # Check for problematic characters that could cause SQL issues
        if "'" in v:
            raise ValueError(f"Metric name '{v}' contains invalid characters.")

        # Check if it's a reserved SQL keyword (common ones)
        reserved_keywords = {
            "SELECT",
            "FROM",
            "WHERE",
            "JOIN",
            "GROUP",
            "ORDER",
            "HAVING",
            "INSERT",
            "UPDATE",
            "DELETE",
            "CREATE",
            "DROP",
            "ALTER",
            "TABLE",
            "INDEX",
            "VIEW",
            "UNION",
            "AND",
            "OR",
            "NOT",
            "IN",
            "EXISTS",
            "BETWEEN",
            "LIKE",
            "IS",
            "NULL",
            "AS",
        }
        if v.upper() in reserved_keywords:
            raise ValueError(f"Metric name '{v}' is a reserved SQL keyword.")

        # Check if name starts with a number (invalid without quotes)
        if v and v[0].isdigit():
            raise ValueError(f"Metric name '{v}' cannot start with a number.")

        return v
