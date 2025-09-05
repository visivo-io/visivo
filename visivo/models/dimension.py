from typing import Optional
from pydantic import Field, ConfigDict, field_validator
from visivo.models.base.named_model import NamedModel
import sqlglot


class Dimension(NamedModel):
    """
    A Dimension represents a computed field at the row level that can be used for grouping or filtering.

    Unlike metrics which are aggregates, dimensions are calculated for each row and can be used
    in GROUP BY clauses or as filter conditions. They allow you to define reusable calculated
    fields without repeating the logic in every query.

    !!! example
        ```yaml
        models:
          - name: orders
            sql: SELECT * FROM orders_table
            dimensions:
              - name: order_month
                expression: "DATE_TRUNC('month', order_date)"
                description: "Month when the order was placed"
              - name: is_high_value
                expression: "CASE WHEN amount > 1000 THEN true ELSE false END"
                description: "Whether this is a high-value order"
        ```
    """

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    expression: str = Field(
        ...,
        description="SQL expression that computes the dimension value for each row. "
        "Can reference any field from the parent model.",
    )

    data_type: Optional[str] = Field(
        None,
        description="SQL data type of the dimension (e.g., VARCHAR, INTEGER, DATE). "
        "Automatically detected for implicit dimensions extracted from model columns.",
    )

    description: Optional[str] = Field(
        None, description="Human-readable description of what this dimension represents."
    )

    @field_validator("name")
    @classmethod
    def validate_sql_identifier(cls, v: Optional[str]) -> Optional[str]:
        """Validate that the dimension name is a valid SQL identifier."""
        if v is None:
            return v

        # Check for dangerous SQL patterns
        if ";" in v or "--" in v or "/*" in v or "*/" in v:
            raise ValueError(f"Dimension name '{v}' contains potentially dangerous SQL characters.")

        # Check for problematic characters that could cause SQL issues
        if "'" in v:
            raise ValueError(f"Dimension name '{v}' contains invalid characters.")

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
            raise ValueError(f"Dimension name '{v}' is a reserved SQL keyword.")

        # Check if name starts with a number (invalid without quotes)
        if v and v[0].isdigit():
            raise ValueError(f"Dimension name '{v}' cannot start with a number.")

        return v
