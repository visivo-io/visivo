"""
ORDER BY clause builder component for SQL queries.

Handles construction of ORDER BY clauses with proper alias resolution.
"""

from typing import List, Dict, Optional
from sqlglot import exp
from visivo.query.sqlglot_utils import parse_expression


class OrderByBuilder:
    """Builds ORDER BY clauses for SQL queries."""

    def __init__(self, dialect: str):
        """
        Initialize the ORDER BY builder.

        Args:
            dialect: SQL dialect to use for parsing
        """
        self.dialect = dialect

    def build(
        self,
        select_expr: exp.Select,
        order_by_items: Optional[List[str]],
        select_items: Optional[Dict[str, str]] = None,
        sanitize_alias_fn=None,
    ) -> exp.Select:
        """
        Add ORDER BY clause to a SELECT expression.

        When GROUP BY is present, we need to check if the ORDER BY column
        is actually an alias in the SELECT clause and use that instead.

        Args:
            select_expr: The SELECT expression to modify
            order_by_items: List of ORDER BY expressions
            select_items: Dictionary of alias to expression for alias resolution
            sanitize_alias_fn: Optional function to sanitize aliases

        Returns:
            The modified SELECT expression with ORDER BY
        """
        if not order_by_items:
            return select_expr

        parsed_items = []

        # Check if GROUP BY is present
        has_group_by = select_expr.find(exp.Group)

        # Build mappings for alias lookup
        alias_mapping = {}
        base_column_mapping = {}  # Maps base column names to their aliases

        if has_group_by and select_items:
            for alias, expression in select_items.items():
                sanitized_alias = sanitize_alias_fn(alias) if sanitize_alias_fn else alias
                # Store both the original expression and any column references
                alias_mapping[expression] = sanitized_alias
                # Also check for simple column names
                if "(" not in expression and "." not in expression:
                    alias_mapping[expression.lower()] = sanitized_alias

                # Check if this is a transformed column (e.g., "year::varchar" or "CAST(year AS ...)")
                parsed_expr = parse_expression(expression, dialect=self.dialect)
                if parsed_expr:
                    # Check if it's a Cast expression
                    if isinstance(parsed_expr, exp.Cast):
                        # Extract the base column from the Cast
                        if isinstance(parsed_expr.this, exp.Column):
                            base_column = parsed_expr.this.name.lower()
                            base_column_mapping[base_column] = sanitized_alias
                    # Also check for PostgreSQL-style casts parsed as binary operations
                    elif hasattr(parsed_expr, "this") and hasattr(parsed_expr, "expression"):
                        # Sometimes year::varchar is parsed as a binary operation
                        if isinstance(parsed_expr.this, exp.Column):
                            base_column = parsed_expr.this.name.lower()
                            base_column_mapping[base_column] = sanitized_alias

        for order_item in order_by_items:
            # Handle DESC/ASC modifiers explicitly
            desc = False
            if order_item.upper().endswith(" DESC"):
                column = order_item[:-5].strip()
                desc = True
            elif order_item.upper().endswith(" ASC"):
                column = order_item[:-4].strip()
                desc = False
            else:
                column = order_item.strip()

            # If GROUP BY is present, check various mappings
            if has_group_by:
                column_lower = column.lower()

                # First check if this column has been transformed
                if column_lower in base_column_mapping:
                    # Use the alias of the transformed column
                    order_column = exp.Identifier(
                        this=base_column_mapping[column_lower], quoted=True
                    )
                # Then check if this column is directly in alias mapping
                elif column_lower in alias_mapping:
                    # Use the alias instead of the column
                    order_column = exp.Identifier(this=alias_mapping[column_lower], quoted=True)
                elif column in alias_mapping:
                    # Check exact match too
                    order_column = exp.Identifier(this=alias_mapping[column], quoted=True)
                else:
                    # Use the column as-is
                    order_column = exp.Column(this=column)
            else:
                # No GROUP BY, use the column as-is
                order_column = exp.Column(this=column)

            if desc:
                parsed = exp.Ordered(this=order_column, desc=True)
            else:
                parsed = (
                    exp.Ordered(this=order_column, desc=False)
                    if order_item.upper().endswith(" ASC")
                    else order_column
                )

            parsed_items.append(parsed)

        if parsed_items:
            select_expr = select_expr.order_by(*parsed_items)

        return select_expr
