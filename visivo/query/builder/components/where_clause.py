"""
WHERE clause builder component for SQL queries.

Handles construction of WHERE clauses from vanilla (non-aggregate) filters.
"""

from typing import List, Dict, Union, Optional
from sqlglot import exp
from visivo.query.sqlglot_utils import parse_expression, has_aggregate_function


class WhereClauseBuilder:
    """Builds WHERE clauses for SQL queries."""

    def __init__(self, dialect: str):
        """
        Initialize the WHERE clause builder.

        Args:
            dialect: SQL dialect to use for parsing
        """
        self.dialect = dialect

    def build(self, select_expr: exp.Select, filters: Optional[Union[Dict, List]]) -> exp.Select:
        """
        Add WHERE clause to a SELECT expression from vanilla filters.

        Args:
            select_expr: The SELECT expression to modify
            filters: Filter conditions (dict with 'vanilla'/'aggregate' keys, or list)

        Returns:
            The modified SELECT expression with WHERE clause
        """
        if not filters:
            return select_expr

        conditions = self._extract_vanilla_conditions(filters)

        if conditions:
            # Combine multiple conditions with AND
            if len(conditions) == 1:
                select_expr = select_expr.where(conditions[0])
            else:
                combined = conditions[0]
                for condition in conditions[1:]:
                    combined = exp.And(this=combined, expression=condition)
                select_expr = select_expr.where(combined)

        return select_expr

    def _extract_vanilla_conditions(self, filters: Union[Dict, List]) -> List[exp.Expression]:
        """
        Extract vanilla (non-aggregate) filter conditions.

        Args:
            filters: Filter conditions

        Returns:
            List of parsed filter expressions
        """
        conditions = []

        if isinstance(filters, dict):
            # Only get vanilla filters for WHERE clause
            if "vanilla" in filters and filters["vanilla"]:
                for filter_expr in filters["vanilla"]:
                    parsed = parse_expression(filter_expr, dialect=self.dialect)
                    if parsed:
                        conditions.append(parsed)
        elif isinstance(filters, list):
            # For list format, check if each filter contains aggregates
            for filter_expr in filters:
                parsed = parse_expression(filter_expr, dialect=self.dialect)
                if parsed and not has_aggregate_function(parsed):
                    conditions.append(parsed)

        return conditions
