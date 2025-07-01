"""
SQLGlot-based SQL validation and classification for Visivo traces.

This module replaces the custom regex-based SQL parsing with SQLGlot's robust AST parsing.
It provides validation, dialect handling, and query classification functionality.
"""

from sqlglot import parse_one, ParseError, exp
from typing import Optional, List, Union
import warnings


# Mapping from Visivo dialect names to SQLGlot dialect names
VISIVO_TO_SQLGLOT = {
    "postgresql": "postgres",
    "bigquery": "bigquery", 
    "duckdb": "duckdb",
    "mysql": "mysql",
    "sqlite": "sqlite",
    "snowflake": "snowflake"
}

# Supported dialects for inference
SUPPORTED_DIALECTS = ("postgres", "snowflake", "mysql", "bigquery", "duckdb", "sqlite")


def validate_select_query(sql: str, dialect: Optional[str] = None) -> exp.Expression:
    """
    Parse and validate that a SQL string is a valid SELECT statement.
    
    Args:
        sql: The SQL string to validate
        dialect: Optional SQLGlot dialect name (e.g., "postgres", "snowflake")
        
    Returns:
        The parsed SQLGlot AST if valid
        
    Raises:
        ValueError: If SQL is invalid syntax or not a SELECT statement
    """
    try:
        # Use specified dialect if given, else use generic parser
        ast = parse_one(sql, read=dialect) if dialect else parse_one(sql)
    except ParseError as e:
        # Parsing failed – raise clear error with details
        raise ValueError(f"Invalid SQL syntax: {e}")
    
    # Ensure the AST represents a SELECT (and not INSERT/DDL/etc.)
    if not isinstance(ast, (exp.Select, exp.Union, exp.CTE)):
        raise ValueError("Query is not a SELECT statement (DML)!")
        
    return ast


def classify_query_ast(ast: exp.Expression) -> str:
    """
    Classify a query AST as window, aggregate, or vanilla.
    
    Args:
        ast: SQLGlot AST expression
        
    Returns:
        "window" if contains window functions, "aggregate" if contains aggregates,
        "vanilla" if neither (window takes precedence over aggregate)
    """
    has_window = ast.find(exp.Window) is not None
    has_agg = ast.find(exp.AggFunc) is not None
    
    if has_window:
        return "window"
    elif has_agg:
        return "aggregate"
    else:
        return "vanilla"


def classify_expression(expr_str: str, dialect: Optional[str] = None) -> str:
    """
    Classify a single SQL expression as window, aggregate, or vanilla.
    
    Args:
        expr_str: SQL expression string
        dialect: Optional SQLGlot dialect name
        
    Returns:
        Classification string: "window", "aggregate", or "vanilla"
    """
    try:
        # Try parsing as standalone expression first
        ast = parse_one(expr_str, read=dialect) if dialect else parse_one(expr_str)
    except ParseError:
        # If that fails, wrap in a SELECT and parse
        try:
            temp_sql = f"SELECT {expr_str}"
            full_ast = parse_one(temp_sql, read=dialect) if dialect else parse_one(temp_sql)
            # Get the first select expression
            if isinstance(full_ast, exp.Select) and full_ast.expressions:
                ast = full_ast.expressions[0]
            else:
                return "vanilla"  # Fallback if we can't parse
        except ParseError:
            return "vanilla"  # Fallback if parsing fails entirely
    
    return classify_query_ast(ast)


def infer_dialect(sql: str, candidates: tuple = SUPPORTED_DIALECTS) -> Optional[str]:
    """
    Attempt to infer the SQL dialect by trying to parse with different dialects.
    
    Args:
        sql: SQL string to analyze
        candidates: Tuple of dialect names to try
        
    Returns:
        The first dialect that successfully parses the SQL, or None if none work
    """
    for dialect in candidates:
        try:
            parse_one(sql, read=dialect)
            return dialect  # parsed successfully with this dialect
        except ParseError:
            continue
    return None  # None if no candidate matches


def get_sqlglot_dialect(visivo_dialect: Optional[str]) -> Optional[str]:
    """
    Convert a Visivo dialect name to the corresponding SQLGlot dialect name.
    
    Args:
        visivo_dialect: Visivo dialect name (e.g., "postgresql", "snowflake")
        
    Returns:
        SQLGlot dialect name or None if not found
    """
    if not visivo_dialect:
        return None
    return VISIVO_TO_SQLGLOT.get(visivo_dialect.lower())


def extract_groupby_expressions(
    ast: exp.Expression, 
    dialect: Optional[str] = None
) -> List[str]:
    """
    Extract expressions that should be in GROUP BY from a SELECT AST.
    
    Returns non-aggregate, non-window expressions from the SELECT list,
    but only if the query contains aggregates or window functions.
    
    Args:
        ast: SQLGlot SELECT AST
        dialect: Optional dialect for SQL generation
        
    Returns:
        List of SQL expression strings that should be grouped by
    """
    if not isinstance(ast, exp.Select):
        return []
    
    # First check if the query has any aggregates or windows at all
    query_classification = classify_query_ast(ast)
    if query_classification == "vanilla":
        return []  # No GROUP BY needed for vanilla queries
    
    groupby_exprs = []
    
    for expr in ast.expressions:
        # Check if this expression contains aggregates or windows
        has_agg = expr.find(exp.AggFunc) is not None
        has_window = expr.find(exp.Window) is not None
        
        # If it's neither aggregate nor window, it should be grouped by
        if not has_agg and not has_window:
            # Convert back to SQL string
            expr_sql = expr.sql(dialect=dialect) if dialect else str(expr)
            groupby_exprs.append(expr_sql)
    
    return groupby_exprs


def validate_and_classify_trace_sql(
    sql: str, 
    source_dialect: Optional[str] = None
) -> tuple[exp.Expression, str, Optional[str]]:
    """
    Complete validation and classification workflow for trace SQL.
    
    Args:
        sql: The trace SQL to validate
        source_dialect: Visivo source dialect name
        
    Returns:
        Tuple of (parsed_ast, classification, sqlglot_dialect)
        
    Raises:
        ValueError: If SQL is invalid or not a SELECT statement
    """
    # Convert Visivo dialect to SQLGlot dialect
    sqlglot_dialect = get_sqlglot_dialect(source_dialect)
    
    # If no dialect provided, try to infer it
    if not sqlglot_dialect:
        sqlglot_dialect = infer_dialect(sql)
    
    # Validate and parse the SQL
    ast = validate_select_query(sql, sqlglot_dialect)
    
    # Classify the query
    classification = classify_query_ast(ast)
    
    return ast, classification, sqlglot_dialect