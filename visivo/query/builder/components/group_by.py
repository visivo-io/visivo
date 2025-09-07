"""
GROUP BY clause builder component for SQL queries.

Handles construction of GROUP BY clauses based on aggregate analysis.
"""

from typing import Dict, Optional
from sqlglot import exp
from visivo.query.sqlglot_utils import (
    parse_expression,
    has_aggregate_function,
    has_window_function,
    find_non_aggregated_columns,
)


class GroupByBuilder:
    """Builds GROUP BY clauses for SQL queries."""

    def __init__(self, dialect: str):
        """
        Initialize the GROUP BY builder.

        Args:
            dialect: SQL dialect to use for parsing
        """
        self.dialect = dialect

    def needs_group_by(self, select_items: Optional[Dict[str, str]]) -> bool:
        """
        Determine if GROUP BY is needed based on aggregates and non-aggregates.

        Args:
            select_items: Dictionary of alias to expression

        Returns:
            True if GROUP BY is required
        """
        if not select_items:
            return False

        has_aggregates = False
        has_non_aggregates = False

        for expression in select_items.values():
            # Parse the expression
            parsed = parse_expression(expression, dialect=self.dialect)
            if not parsed:
                continue

            # Skip window functions - they don't require GROUP BY
            if has_window_function(parsed):
                continue

            # Check for aggregates (excluding window functions)
            if has_aggregate_function(parsed) and not has_window_function(parsed):
                has_aggregates = True

            # Check for non-aggregated columns
            non_agg_cols = find_non_aggregated_columns(parsed)
            if non_agg_cols:
                has_non_aggregates = True

        return has_aggregates and has_non_aggregates

    def build(
        self,
        select_expr: exp.Select,
        select_items: Optional[Dict[str, str]],
        cohort_on: Optional[str] = None,
        sanitize_alias_fn=None,
    ) -> exp.Select:
        """
        Add GROUP BY clause for non-aggregate columns.

        Args:
            select_expr: The SELECT expression to modify
            select_items: Dictionary of alias to expression
            cohort_on: Optional cohort_on value to include in GROUP BY
            sanitize_alias_fn: Optional function to sanitize aliases

        Returns:
            The modified SELECT expression with GROUP BY
        """
        if not select_items:
            return select_expr

        group_by_items = []

        # Get non-aggregate columns from select items
        for alias, expression in select_items.items():
            parsed = parse_expression(expression, dialect=self.dialect)
            if not parsed:
                continue

            # Skip window functions - they don't go in GROUP BY
            if has_window_function(parsed):
                continue

            # Check if this is a non-aggregate expression
            if not has_aggregate_function(parsed):
                # Use the sanitized quoted alias for GROUP BY to match SELECT
                sanitized_alias = sanitize_alias_fn(alias) if sanitize_alias_fn else alias
                group_by_items.append(exp.Identifier(this=sanitized_alias, quoted=True))

        # Always add cohort_on to GROUP BY if it exists and we have GROUP BY items
        if group_by_items and cohort_on:
            # Check if cohort_on is not a literal string (which shouldn't be grouped by)
            cohort_on_value = cohort_on.strip()
            if not (cohort_on_value.startswith("'") and cohort_on_value.endswith("'")):
                # It's a column reference, add to GROUP BY
                group_by_items.append(exp.Identifier(this="cohort_on", quoted=True))
            elif group_by_items:
                # Even for literal cohort_on values, we need to include it in GROUP BY
                # since it's in the SELECT clause
                group_by_items.append(exp.Identifier(this="cohort_on", quoted=True))

        # Add GROUP BY clause if there are items
        if group_by_items:
            select_expr = select_expr.group_by(*group_by_items)

        return select_expr
