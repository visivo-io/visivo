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
    "redshift": "redshift",
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
    # All aggregate functions in SQLGlot inherit from exp.AggFunc
    for node in expr.walk():
        if isinstance(node, exp.AggFunc):
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
    non_aggregated = set()

    # Find all column references
    for column in expr.find_all(exp.Column):
        # Check if this column is inside an aggregate function
        is_aggregated = False
        parent = column.parent

        while parent:
            # Check if parent is an aggregate function (all inherit from exp.AggFunc)
            if isinstance(parent, exp.AggFunc):
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

    Raises:
        ValueError: If the statement cannot be parsed as valid SQL
    """
    expr = parse_expression(statement, dialect)
    if not expr:
        # If SQLGlot can't parse it, it's likely invalid SQL
        # We should fail fast with a clear error rather than guessing
        raise ValueError(
            f"Unable to parse SQL statement: '{statement}'. "
            f"Please check for syntax errors or unsupported SQL constructs."
        )

    if has_window_function(expr):
        return "window"
    elif has_aggregate_function(expr):
        # SQLGlot recognized it as an aggregate
        # Trust SQLGlot to transpile it correctly for the target dialect
        return "aggregate"
    else:
        return "vanilla"


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
