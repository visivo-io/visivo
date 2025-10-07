from typing import Optional
import re
from pydantic import Field, ConfigDict, field_validator, PrivateAttr
from visivo.models.base.named_model import NamedModel
from visivo.models.base.parent_model import ParentModel


class Dimension(NamedModel, ParentModel):
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

    _parent_name: Optional[str] = PrivateAttr(default=None)

    def set_parent_name(self, value: str):
        """Set the parent model name for nested dimensions."""
        self._parent_name = value

    @field_validator("name")
    @classmethod
    def validate_sql_identifier(cls, v: Optional[str]) -> Optional[str]:
        """Validate that the dimension name is a valid identifier."""
        if v is None:
            return v

        # Use regex to validate: alphanumeric and underscores only, no whitespace or dots
        if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", v):
            raise ValueError(
                f"Dimension name '{v}' must contain only letters, numbers, and underscores, "
                "and cannot start with a number."
            )

        return v

    @field_validator("expression")
    @classmethod
    def validate_no_ref_in_nested_expression(cls, v: str, info) -> str:
        """Prevent ref() syntax in nested dimension expressions."""
        from visivo.query.patterns import has_CONTEXT_STRING_REF_PATTERN

        # Only validate if this is a nested dimension (parent_name will be set during model parsing)
        # We can't check _parent_name here since it's set after validation
        # Instead, we validate this in SqlModel after setting parent names
        return v

    def child_items(self):
        """
        Return child items for DAG construction.

        For nested dimensions (those defined under a model), this returns a reference to the parent model.
        For standalone dimensions (project-level), this extracts model/dimension references from the expression.

        Returns:
            List of ref() strings for dependencies
        """
        children = []

        # Check if this is a nested dimension (has a parent_name set)
        if hasattr(self, "_parent_name") and self._parent_name:
            # Nested dimension - reference the parent model only
            children.append(f"ref({self._parent_name})")
        else:
            # Standalone dimension - extract references from expression
            from visivo.query.patterns import extract_ref_components

            if self.expression:
                ref_components = extract_ref_components(self.expression)

                # Convert to ref() format for DAG
                for model_or_dim_name, field_name in ref_components:
                    children.append(f"ref({model_or_dim_name})")

        return children
