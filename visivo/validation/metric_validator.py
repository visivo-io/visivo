"""
Validation logic for metrics and relations using SQLGlot.
"""

from typing import Optional, Set, Tuple
import sqlglot
from sqlglot import expressions as exp
from sqlglot.errors import ParseError


class MetricValidator:
    """Validates metric expressions and relation conditions using SQLGlot."""

    @staticmethod
    def _get_sqlglot_dialect(source_type: Optional[str] = None) -> str:
        """
        Maps source types to SQLGlot dialect names.

        Args:
            source_type: The source type (e.g., 'postgresql', 'mysql', 'snowflake')

        Returns:
            SQLGlot dialect name
        """
        if not source_type:
            return "postgres"  # Default to postgres

        dialect_map = {
            "postgresql": "postgres",
            "postgres": "postgres",
            "mysql": "mysql",
            "snowflake": "snowflake",
            "bigquery": "bigquery",
            "sqlite": "sqlite",
            "duckdb": "duckdb",
            "redshift": "redshift",
            "presto": "presto",
            "trino": "trino",
            "spark": "spark",
            "hive": "hive",
            "oracle": "oracle",
            "tsql": "tsql",
            "mssql": "tsql",
            "sqlserver": "tsql",
        }

        return dialect_map.get(source_type.lower(), "postgres")

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
            return False, f"SQL parsing error: {str(e)}"
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

        # First, replace ${ref(model).field} with model.field for SQLGlot parsing
        import re

        sql_condition = re.sub(r"\$\{ref\(([^)]+)\)\.([^}]+)\}", r"\1.\2", condition)

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

            # Check that both models are referenced
            if left_model not in referenced_tables:
                return False, f"Join condition must reference left model '{left_model}'"
            if right_model not in referenced_tables:
                return False, f"Join condition must reference right model '{right_model}'"

            # Check for aggregate functions (not allowed in join conditions)
            if MetricValidator._has_aggregate_function(where_clause):
                return False, "Join conditions cannot contain aggregate functions"

            return True, None

        except ParseError as e:
            return False, f"SQL parsing error: {str(e)}"
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
            return False, f"SQL parsing error: {str(e)}"
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
                # Check for standard aggregate functions available in SQLGlot
                if isinstance(parent, (exp.Sum, exp.Count, exp.Avg, exp.Min, exp.Max)):
                    return True
                # Check for additional aggregate functions that might exist
                try:
                    if hasattr(exp, "Stddev") and isinstance(parent, exp.Stddev):
                        return True
                    if hasattr(exp, "StdDev") and isinstance(parent, exp.StdDev):
                        return True
                    if hasattr(exp, "Variance") and isinstance(parent, exp.Variance):
                        return True
                    if hasattr(exp, "ArrayAgg") and isinstance(parent, exp.ArrayAgg):
                        return True
                except:
                    pass
                # Also check for common aggregate function calls
                if (
                    isinstance(parent, exp.Anonymous)
                    and parent.this
                    and str(parent.this).upper()
                    in [
                        "SUM",
                        "COUNT",
                        "AVG",
                        "MIN",
                        "MAX",
                        "STDDEV",
                        "STDDEV_POP",
                        "STDDEV_SAMP",
                        "VARIANCE",
                        "VAR_POP",
                        "VAR_SAMP",
                        "ARRAY_AGG",
                        "STRING_AGG",
                        "LISTAGG",
                    ]
                ):
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
        # Check for standard aggregate functions that are definitely available
        basic_aggregate_types = [exp.Sum, exp.Count, exp.Avg, exp.Min, exp.Max]

        for agg_type in basic_aggregate_types:
            if node.find(agg_type):
                return True

        # Check for additional aggregate types if they exist
        additional_types = ["Stddev", "StdDev", "Variance", "ArrayAgg", "StringAgg"]
        for type_name in additional_types:
            if hasattr(exp, type_name):
                agg_type = getattr(exp, type_name)
                if node.find(agg_type):
                    return True

        # Also check for function calls with aggregate names
        for func in node.find_all(exp.Anonymous):
            if func.this and str(func.this).upper() in [
                "SUM",
                "COUNT",
                "AVG",
                "MIN",
                "MAX",
                "STDDEV",
                "STDDEV_POP",
                "STDDEV_SAMP",
                "VARIANCE",
                "VAR_POP",
                "VAR_SAMP",
                "ARRAY_AGG",
                "STRING_AGG",
                "LISTAGG",
            ]:
                return True

        return False
