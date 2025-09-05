"""
HAVING clause builder component for SQL queries.

Handles construction of HAVING clauses from aggregate filters.
"""

from typing import List, Dict, Union, Optional
from sqlglot import exp
from visivo.query.sqlglot_utils import parse_expression, has_aggregate_function


class HavingClauseBuilder:
    """Builds HAVING clauses for SQL queries."""

    def __init__(self, dialect: str):
        """
        Initialize the HAVING clause builder.

        Args:
            dialect: SQL dialect to use for parsing
        """
        self.dialect = dialect

    def build(self, select_expr: exp.Select, filters: Optional[Union[Dict, List]]) -> exp.Select:
        """
        Add HAVING clause to a SELECT expression from aggregate filters.

        Args:
            select_expr: The SELECT expression to modify
            filters: Filter conditions (dict with 'vanilla'/'aggregate' keys, or list)

        Returns:
            The modified SELECT expression with HAVING clause
        """
        if not filters:
            return select_expr

        conditions = self._extract_aggregate_conditions(filters)

        if conditions:
            # Combine multiple conditions with AND
            if len(conditions) == 1:
                select_expr = select_expr.having(conditions[0])
            else:
                combined = conditions[0]
                for condition in conditions[1:]:
                    combined = exp.And(this=combined, expression=condition)
                select_expr = select_expr.having(combined)

        return select_expr

    def _extract_aggregate_conditions(self, filters: Union[Dict, List]) -> List[exp.Expression]:
        """
        Extract aggregate filter conditions.

        Args:
            filters: Filter conditions

        Returns:
            List of parsed filter expressions
        """
        conditions = []

        if isinstance(filters, dict):
            # Only get aggregate filters for HAVING clause
            if "aggregate" in filters and filters["aggregate"]:
                for filter_expr in filters["aggregate"]:
                    parsed = parse_expression(filter_expr, dialect=self.dialect)
                    if parsed:
                        conditions.append(parsed)
        elif isinstance(filters, list):
            # For list format, check if each filter contains aggregates
            for filter_expr in filters:
                parsed = parse_expression(filter_expr, dialect=self.dialect)
                if parsed and has_aggregate_function(parsed):
                    conditions.append(parsed)

        return conditions
