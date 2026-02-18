"""
SQL table extraction utilities using SQLGlot AST.

Extracts table references from SQL queries for schema filtering,
enabling efficient schema lookups by only loading relevant tables.
"""

import sqlglot
from sqlglot import exp
from typing import Set, Optional

from visivo.query.sqlglot_utils import get_sqlglot_dialect


def extract_table_references(sql: str, dialect: str) -> Set[str]:
    """
    Extract table names referenced in a SQL query using SQLGlot AST.

    This function parses the SQL and extracts all table references,
    excluding CTEs (Common Table Expressions) which are defined within
    the query rather than being external tables.

    Args:
        sql: SQL query string to analyze
        dialect: Visivo dialect name (e.g., "duckdb", "snowflake", "postgresql")

    Returns:
        Set of table names (without schema qualifiers) referenced in the query

    Example:
        >>> sql = "SELECT * FROM orders o JOIN customers c ON o.id = c.id"
        >>> extract_table_references(sql, "duckdb")
        {'orders', 'customers'}

        >>> sql = "WITH t AS (SELECT * FROM orders) SELECT * FROM t JOIN customers"
        >>> extract_table_references(sql, "duckdb")
        {'orders', 'customers'}  # 't' excluded as it's a CTE
    """
    try:
        sqlglot_dialect = get_sqlglot_dialect(dialect) if dialect else None
        expr = sqlglot.parse_one(sql, read=sqlglot_dialect)

        if expr is None:
            return set()

        # Collect CTE names to exclude them from table references
        cte_names = _extract_cte_names(expr)

        # Extract all table references
        tables = set()
        for table in expr.find_all(exp.Table):
            table_name = table.name
            if table_name and table_name not in cte_names:
                tables.add(table_name)

        return tables

    except Exception:
        # If parsing fails, return empty set - caller should handle gracefully
        return set()


def extract_qualified_table_references(sql: str, dialect: str) -> Set[str]:
    """
    Extract fully qualified table references (schema.table) from SQL query.

    For tables with schema qualifiers (e.g., REPORTING.goals), returns
    the full qualified name. For unqualified tables, returns just the table name.

    Args:
        sql: SQL query string to analyze
        dialect: Visivo dialect name

    Returns:
        Set of table references, some may be schema.table format

    Example:
        >>> sql = "SELECT * FROM orders JOIN REPORTING.goals ON 1=1"
        >>> extract_qualified_table_references(sql, "snowflake")
        {'orders', 'REPORTING.goals'}
    """
    try:
        sqlglot_dialect = get_sqlglot_dialect(dialect) if dialect else None
        expr = sqlglot.parse_one(sql, read=sqlglot_dialect)

        if expr is None:
            return set()

        cte_names = _extract_cte_names(expr)

        tables = set()
        for table in expr.find_all(exp.Table):
            table_name = table.name
            if not table_name or table_name in cte_names:
                continue

            # Check for schema qualifier (db in SQLGlot terminology)
            schema_name = table.db
            if schema_name:
                tables.add(f"{schema_name}.{table_name}")
            else:
                tables.add(table_name)

        return tables

    except Exception:
        return set()


def _extract_cte_names(expr: exp.Expression) -> Set[str]:
    """
    Extract CTE (Common Table Expression) names from a query.

    CTEs are defined with WITH clauses and should not be looked up
    as external tables.

    Args:
        expr: Parsed SQLGlot expression

    Returns:
        Set of CTE names defined in the query
    """
    cte_names = set()
    for cte in expr.find_all(exp.CTE):
        alias = cte.alias_or_name
        if alias:
            cte_names.add(alias)
    return cte_names


def extract_schema_references(sql: str, dialect: str) -> Set[str]:
    """
    Extract unique schema names referenced in a SQL query.

    Args:
        sql: SQL query string to analyze
        dialect: Visivo dialect name

    Returns:
        Set of schema names referenced (excluding default/unqualified tables)

    Example:
        >>> sql = "SELECT * FROM orders JOIN REPORTING.goals ON 1=1"
        >>> extract_schema_references(sql, "snowflake")
        {'REPORTING'}
    """
    try:
        sqlglot_dialect = get_sqlglot_dialect(dialect) if dialect else None
        expr = sqlglot.parse_one(sql, read=sqlglot_dialect)

        if expr is None:
            return set()

        cte_names = _extract_cte_names(expr)

        schemas = set()
        for table in expr.find_all(exp.Table):
            table_name = table.name
            if table_name in cte_names:
                continue

            schema_name = table.db
            if schema_name:
                schemas.add(schema_name)

        return schemas

    except Exception:
        return set()
