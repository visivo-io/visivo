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
            parsed = parse_expression(expression, dialect=self.dialect)
            if not parsed:
                continue

            if has_window_function(parsed):
                continue

            if has_aggregate_function(parsed) and not has_window_function(parsed):
                has_aggregates = True
            non_agg_cols = find_non_aggregated_columns(parsed)
            if non_agg_cols:
                has_non_aggregates = True

        return has_aggregates and has_non_aggregates

    def build(
        self,
        select_expr: exp.Select,
        select_items: Optional[Dict[str, str]],
        split_column: Optional[str] = None,
        sanitize_alias_fn=None,
    ) -> exp.Select:
        """
        Add GROUP BY clause for non-aggregate columns.

        Args:
            select_expr: The SELECT expression to modify
            select_items: Dictionary of alias to expression
            split_column: Optional split_column value to include in GROUP BY
            sanitize_alias_fn: Optional function to sanitize aliases

        Returns:
            The modified SELECT expression with GROUP BY
        """
        if not select_items:
            return select_expr

        group_by_items = []

        for alias, expression in select_items.items():
            parsed = parse_expression(expression, dialect=self.dialect)
            if not parsed:
                continue

            if has_window_function(parsed):
                continue

            if not has_aggregate_function(parsed):
                sanitized_alias = sanitize_alias_fn(alias) if sanitize_alias_fn else alias
                group_by_items.append(exp.Identifier(this=sanitized_alias, quoted=True))

        if group_by_items and split_column:
            split_column_value = split_column.strip()
            if not (split_column_value.startswith("'") and split_column_value.endswith("'")):
                group_by_items.append(exp.Identifier(this="split_column", quoted=True))
            elif group_by_items:
                group_by_items.append(exp.Identifier(this="split_column", quoted=True))

        if group_by_items:
            select_expr = select_expr.group_by(*group_by_items)

        return select_expr
