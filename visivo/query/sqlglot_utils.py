"""
SQLGlot utility functions for AST analysis and SQL building.
"""

import sqlglot
from sqlglot import exp
from typing import List, Set, Optional, Tuple


# Map Visivo dialect names to SQLGlot dialect names
VISIVO_TO_SQLGLOT_DIALECT = {
    "postgresql": "postgres",
    "mysql": "mysql",
    "snowflake": "snowflake",
    "bigquery": "bigquery",
    "sqlite": "sqlite",
    "duckdb": "duckdb",
}


def get_sqlglot_dialect(visivo_dialect: str) -> str:
    """Convert Visivo dialect name to SQLGlot dialect name."""
    return VISIVO_TO_SQLGLOT_DIALECT.get(visivo_dialect, visivo_dialect)


def parse_expression(statement: str, dialect: str = None) -> Optional[exp.Expression]:
    """
    Parse a SQL statement or expression into an AST.

    Args:
        statement: SQL statement or expression to parse
        dialect: SQLGlot dialect name (optional)

    Returns:
        Parsed AST expression or None if parsing fails
    """
    if not statement or not statement.strip():
        return None

    try:
        sqlglot_dialect = get_sqlglot_dialect(dialect) if dialect else None
        return sqlglot.parse_one(statement, dialect=sqlglot_dialect)
    except Exception:
        # Try without dialect if it fails
        try:
            return sqlglot.parse_one(statement)
        except Exception:
            return None


def has_aggregate_function(expr: exp.Expression) -> bool:
    """
    Check if an expression contains any aggregate functions.

    Args:
        expr: SQLGlot AST expression

    Returns:
        True if expression contains aggregate functions
    """
    if not expr:
        return False

    # Check for any aggregate function nodes in the AST
    # SQLGlot has various aggregate function types
    aggregate_types = [
        exp.Sum,
        exp.Count,
        exp.Avg,
        exp.Max,
        exp.Min,
        exp.AggFunc,  # Generic aggregate function
    ]

    # Add optional types that might exist
    for attr_name in ["GroupConcat", "ArrayAgg", "StandardDeviation", "Variance", "StdDev"]:
        if hasattr(exp, attr_name):
            aggregate_types.append(getattr(exp, attr_name))

    aggregate_types = tuple(aggregate_types)

    for node in expr.walk():
        if isinstance(node, aggregate_types):
            return True
        # Also check for functions that might be aggregates by name
        if isinstance(node, exp.Anonymous) and node.this:
            func_name = str(node.this).upper()
            # Common aggregate function names
            if func_name in {
                "SUM",
                "COUNT",
                "AVG",
                "MAX",
                "MIN",
                "STDDEV",
                "VARIANCE",
                "GROUP_CONCAT",
                "STRING_AGG",
                "ARRAY_AGG",
                "LISTAGG",
                "MEDIAN",
                "MODE",
                "CORR",
                "COVAR_POP",
                "COVAR_SAMP",
                "ANY_VALUE",
                "BIT_AND",
                "BIT_OR",
                "BIT_XOR",
                "BOOL_AND",
                "BOOL_OR",
                "JSON_AGG",
                "JSONB_AGG",
                "TOTAL",
                "PRODUCT",
                "HISTOGRAM",
            }:
                return True

    return False


def has_window_function(expr: exp.Expression) -> bool:
    """
    Check if an expression contains any window functions.

    Args:
        expr: SQLGlot AST expression

    Returns:
        True if expression contains window functions (OVER clause)
    """
    if not expr:
        return False

    # Check for any window/over clause in the AST
    for node in expr.walk():
        if isinstance(node, exp.Window):
            return True

    return False


def find_non_aggregated_columns(expr: exp.Expression) -> List[str]:
    """
    Find all column references that are not inside aggregate functions.
    These columns need to be included in GROUP BY.

    Args:
        expr: SQLGlot AST expression

    Returns:
        List of column expressions that are not aggregated
    """
    if not expr:
        return []

    non_aggregated = set()

    # Find all column references
    for column in expr.find_all(exp.Column):
        # Check if this column is inside an aggregate function
        is_aggregated = False
        parent = column.parent

        while parent:
            # Check if parent is an aggregate function
            aggregate_parent_types = [exp.Sum, exp.Count, exp.Avg, exp.Max, exp.Min, exp.AggFunc]
            for attr_name in ["GroupConcat", "ArrayAgg", "StandardDeviation", "Variance", "StdDev"]:
                if hasattr(exp, attr_name):
                    aggregate_parent_types.append(getattr(exp, attr_name))

            if isinstance(parent, tuple(aggregate_parent_types)):
                is_aggregated = True
                break
            # Also check for anonymous functions that might be aggregates
            if isinstance(parent, exp.Anonymous) and parent.this:
                func_name = str(parent.this).upper()
                if func_name in {
                    "SUM",
                    "COUNT",
                    "AVG",
                    "MAX",
                    "MIN",
                    "STDDEV",
                    "VARIANCE",
                    "GROUP_CONCAT",
                    "STRING_AGG",
                    "ARRAY_AGG",
                    "LISTAGG",
                }:
                    is_aggregated = True
                    break
            parent = parent.parent

        if not is_aggregated:
            # Get the full expression containing this column
            # We want the highest-level expression that contains this column
            # but isn't the entire statement
            column_expr = column
            parent = column.parent

            while parent and not isinstance(
                parent, (exp.Select, exp.From, exp.Where, exp.Group, exp.Having, exp.Order)
            ):
                if isinstance(parent, exp.Alias):
                    # Stop at alias level
                    break
                column_expr = parent
                parent = parent.parent

            non_aggregated.add(column_expr.sql())

    return list(non_aggregated)


def extract_column_references(expr: exp.Expression) -> Set[str]:
    """
    Extract all column references from an expression.

    Args:
        expr: SQLGlot AST expression

    Returns:
        Set of column names referenced in the expression
    """
    if not expr:
        return set()

    columns = set()
    for column in expr.find_all(exp.Column):
        columns.add(column.sql())

    return columns


def classify_statement(statement: str, dialect: str = None) -> str:
    """
    Classify a SQL statement as 'aggregate', 'vanilla', or 'window'.

    Args:
        statement: SQL statement to classify
        dialect: SQLGlot dialect name (optional)

    Returns:
        Classification: 'aggregate', 'vanilla', or 'window'
    """
    # First try to parse with SQLGlot
    expr = parse_expression(statement, dialect)
    if expr:
        if has_window_function(expr):
            return "window"
        elif has_aggregate_function(expr):
            # SQLGlot recognized it as an aggregate
            # But we need to check if it's valid for the dialect
            if dialect and not _is_valid_aggregate_for_dialect(expr, dialect):
                return "vanilla"
            return "aggregate"
        else:
            return "vanilla"

    # If SQLGlot can't parse it, fall back to simple string matching
    # This handles cases where the SQL might have typos but we still want to classify it
    import re

    # Check for window functions (OVER clause with proper closing)
    # Need to ensure the OVER clause is complete
    if re.search(r"\bover\s*\([^)]*\)", statement, re.IGNORECASE):
        return "window"

    # Check for common aggregate functions based on dialect
    if dialect == "postgres":
        # PostgreSQL doesn't have group_concat
        aggregate_pattern = r"\b(sum|count|avg|max|min|stddev|variance|string_agg|array_agg)\s*\("
    elif dialect == "mysql":
        aggregate_pattern = r"\b(sum|count|avg|max|min|stddev|variance|group_concat)\s*\("
    else:
        # Generic pattern for other dialects
        aggregate_pattern = r"\b(sum|count|avg|max|min|stddev|variance|group_concat|string_agg|array_agg|listagg)\s*\("

    if re.search(aggregate_pattern, statement, re.IGNORECASE):
        return "aggregate"

    return "vanilla"


def _is_valid_aggregate_for_dialect(expr: exp.Expression, dialect: str) -> bool:
    """Check if an aggregate function is valid for the given dialect."""
    # GROUP_CONCAT is only valid for SQLite and MySQL
    if dialect not in ("sqlite", "mysql"):
        for node in expr.walk():
            # Check for GroupConcat expression type
            if hasattr(exp, "GroupConcat") and isinstance(node, exp.GroupConcat):
                return False
            # Also check for Anonymous functions
            if isinstance(node, exp.Anonymous) and node.this:
                func_name = str(node.this).upper()
                if func_name == "GROUP_CONCAT":
                    return False
    return True


def get_expression_for_groupby(expr: exp.Expression) -> str:
    """
    Get the appropriate expression string for GROUP BY clause.
    Some dialects don't support aliases in GROUP BY.

    Args:
        expr: SQLGlot AST expression

    Returns:
        Expression string suitable for GROUP BY
    """
    if not expr:
        return ""

    # If it's an alias, we might need to use the actual expression
    # rather than the alias name depending on the dialect
    if isinstance(expr, exp.Alias):
        # For now, use the actual expression (more compatible)
        return expr.this.sql()

    return expr.sql()
