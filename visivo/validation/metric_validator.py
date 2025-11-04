"""
Validation logic for metrics and relations using SQLGlot.
"""

from typing import Optional, Set, Tuple
import sqlglot
from sqlglot import expressions as exp
from sqlglot.errors import ParseError
from visivo.query.model_name_utils import ModelNameSanitizer


class MetricValidator:
    """Validates metric expressions and relation conditions using SQLGlot."""

    @staticmethod
    def _get_sqlglot_dialect(source_type: Optional[str] = None) -> str:
        from visivo.query.sqlglot_utils import get_sqlglot_dialect

        return get_sqlglot_dialect(source_type)

    @staticmethod
    def validate_aggregate_expression(
        expression: str, source_type: Optional[str] = None
    ) -> Tuple[bool, Optional[str]]:
        """
        Validates that a metric aggregate expression is valid SQL and contains only aggregates.

        Args:
            expression: SQL aggregate expression (e.g., "SUM(amount)")
            source_type: Optional source type for dialect-specific parsing

        Returns:
            Tuple of (is_valid, error_message)
        """
        if not expression:
            return False, "Expression cannot be empty"

        dialect = MetricValidator._get_sqlglot_dialect(source_type)

        try:
            # Parse the expression
            parsed = sqlglot.parse_one(expression, read=dialect)

            # Check if it's a valid expression
            if not parsed:
                return False, "Failed to parse expression"

            # Find all column references that are not inside aggregate functions
            naked_columns = MetricValidator._find_naked_columns(parsed)

            if naked_columns:
                return (
                    False,
                    f"Non-aggregated columns found: {', '.join(naked_columns)}. All columns must be inside aggregate functions.",
                )

            # Check that there's at least one aggregate function
            has_aggregate = MetricValidator._has_aggregate_function(parsed)
            if not has_aggregate:
                return (
                    False,
                    "Expression must contain at least one aggregate function (SUM, COUNT, AVG, etc.)",
                )

            return True, None

        except ParseError as e:
            # Simplify parse errors - they're usually about invalid SQL syntax
            error_msg = str(e)
            if "Required keyword" in error_msg or "missing for" in error_msg:
                return (
                    False,
                    "Invalid SQL syntax. Check for unresolved references like ${ref(...)}.",
                )
            return (
                False,
                f"Invalid SQL syntax: {error_msg.split('.')[0] if '.' in error_msg else error_msg}",
            )
        except Exception as e:
            return False, f"Validation error: {str(e)}"

    @staticmethod
    def validate_join_condition(
        condition: str, left_model: str, right_model: str, source_type: Optional[str] = None
    ) -> Tuple[bool, Optional[str]]:
        """
        Validates that a join condition is valid and references fields from both models.

        Args:
            condition: Join condition with ${ref(model).field} syntax
            left_model: Name of the left model
            right_model: Name of the right model
            source_type: Optional source type for dialect-specific parsing

        Returns:
            Tuple of (is_valid, error_message)
        """
        if not condition:
            return False, "Join condition cannot be empty"

        dialect = MetricValidator._get_sqlglot_dialect(source_type)

        # Create sanitizer for consistent model name handling
        sanitizer = ModelNameSanitizer()

        # First, replace ${ref(model).field} with sanitized_model.field for SQLGlot parsing
        import re
        from visivo.query.patterns import CONTEXT_STRING_REF_PATTERN, get_model_name_from_match

        # Replace ${ref(model).field} patterns with sanitized_model.field for SQLGlot
        # Note: CONTEXT_STRING_REF_PATTERN also matches ${ref(metric)} without field, so we handle both cases
        def replace_for_sql(match):
            ref_content = get_model_name_from_match(match)
            field_raw = match.group("property_path")
            # Strip leading dot if present
            field = field_raw.lstrip(".") if field_raw and field_raw.startswith(".") else field_raw
            # Convert empty string to None
            field = field if field else None

            # Sanitize the model name for SQL
            sanitized_ref = sanitizer.sanitize(ref_content)

            if field:
                return f"{sanitized_ref}.{field}"
            else:
                # For ${ref(metric)} without field, keep sanitized name
                return sanitized_ref

        sql_condition = re.sub(CONTEXT_STRING_REF_PATTERN, replace_for_sql, condition)

        try:
            # Parse the condition as a WHERE clause expression
            parsed = sqlglot.parse_one(f"SELECT * FROM t WHERE {sql_condition}", read=dialect)
            if not parsed:
                return False, "Failed to parse join condition"

            # Extract the WHERE clause
            where_clause = parsed.find(exp.Where)
            if not where_clause:
                return False, "Invalid join condition structure"

            # Find all table references in the condition
            referenced_tables = set()
            for column in where_clause.find_all(exp.Column):
                if column.table:
                    referenced_tables.add(column.table)

            # Sanitize model names for comparison
            sanitized_left = sanitizer.sanitize(left_model)
            sanitized_right = sanitizer.sanitize(right_model)

            # Check that both models are referenced (using sanitized names)
            if sanitized_left not in referenced_tables:
                return False, f"Join condition must reference left model '{left_model}'"
            if sanitized_right not in referenced_tables:
                return False, f"Join condition must reference right model '{right_model}'"

            # Check for aggregate functions (not allowed in join conditions)
            if MetricValidator._has_aggregate_function(where_clause):
                return False, "Join conditions cannot contain aggregate functions"

            return True, None

        except ParseError as e:
            # Simplify parse errors - they're usually about invalid SQL syntax
            error_msg = str(e)
            if "Required keyword" in error_msg or "missing for" in error_msg:
                return (
                    False,
                    "Invalid SQL syntax. Check for unresolved references like ${ref(...)}.",
                )
            return (
                False,
                f"Invalid SQL syntax: {error_msg.split('.')[0] if '.' in error_msg else error_msg}",
            )
        except Exception as e:
            return False, f"Validation error: {str(e)}"

    @staticmethod
    def validate_dimension_expression(
        expression: str, source_type: Optional[str] = None
    ) -> Tuple[bool, Optional[str]]:
        """
        Validates that a dimension expression is valid SQL and doesn't contain aggregates.

        Args:
            expression: SQL expression for the dimension
            source_type: Optional source type for dialect-specific parsing

        Returns:
            Tuple of (is_valid, error_message)
        """
        if not expression:
            return False, "Expression cannot be empty"

        dialect = MetricValidator._get_sqlglot_dialect(source_type)

        try:
            # Parse the expression
            parsed = sqlglot.parse_one(expression, read=dialect)

            if not parsed:
                return False, "Failed to parse expression"

            # Check that there are no aggregate functions (dimensions are row-level)
            if MetricValidator._has_aggregate_function(parsed):
                return False, "Dimension expressions cannot contain aggregate functions"

            return True, None

        except ParseError as e:
            # Simplify parse errors - they're usually about invalid SQL syntax
            error_msg = str(e)
            if "Required keyword" in error_msg or "missing for" in error_msg:
                return (
                    False,
                    "Invalid SQL syntax. Check for unresolved references like ${ref(...)}.",
                )
            return (
                False,
                f"Invalid SQL syntax: {error_msg.split('.')[0] if '.' in error_msg else error_msg}",
            )
        except Exception as e:
            return False, f"Validation error: {str(e)}"

    @staticmethod
    def _find_naked_columns(node) -> Set[str]:
        """
        Finds column references that are not inside aggregate functions.
        """
        naked_columns = set()

        def is_inside_aggregate(n):
            """Check if a node is inside an aggregate function."""
            parent = n.parent
            while parent:
                # Check if parent is any aggregate function
                # This covers ALL SQLGlot aggregate types including:
                # Sum, Count, Avg, Min, Max, StddevPop, StddevSamp, VariancePop, etc.
                if isinstance(parent, exp.AggFunc):
                    return True
                parent = parent.parent
            return False

        # Find all column references
        for column in node.find_all(exp.Column):
            if not is_inside_aggregate(column):
                naked_columns.add(str(column))

        return naked_columns

    @staticmethod
    def _has_aggregate_function(node) -> bool:
        """
        Checks if the expression contains any aggregate functions.
        """
        # Check for any AggFunc type (covers all aggregate functions)
        return node.find(exp.AggFunc) is not None
