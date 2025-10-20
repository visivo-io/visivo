"""
SQLGlot utility functions for AST analysis and SQL building.
"""

import sqlglot
from sqlglot import exp, parse_one
from sqlglot.schema import MappingSchema
from sqlglot.dialects import Dialects
from sqlglot.optimizer import optimize
from typing import List, Set, Optional, Tuple, Dict
from hashlib import md5
from sqlglot.optimizer import qualify


from visivo.models.base.context_string import ContextString



# Map divergent Visivo source types to SQLGlot dialect names
VISIVO_TO_SQLGLOT_DIALECT = {
    "postgresql": "postgres",
}


def get_sqlglot_dialect(visivo_dialect: str) -> str:
    """Convert Visivo dialect name to SQLGlot dialect name."""
    sqlglot_dialects = [i.value for i in Dialects if i != '']
    if visivo_dialect in sqlglot_dialects:
        return visivo_dialect
    else:
        mapped_sqlglot_dialect = VISIVO_TO_SQLGLOT_DIALECT.get(visivo_dialect)

        if mapped_sqlglot_dialect:
            return mapped_sqlglot_dialect
        else: 
            raise NotImplementedError(f"Dialect {visivo_dialect} not found in SQLglot map.")

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

    context_string = ContextString(statement).get_ref_attr()

    if context_string:
        statement = statement.replace(context_string, f"'{context_string}'")

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

        # Special handling for DuckDB-specific aggregates that SQLGlot doesn't recognize
        # MODE is an aggregate in DuckDB but parsed as Anonymous by SQLGlot
        if isinstance(node, exp.Anonymous) and node.this and node.this.upper() == "MODE":
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
            # but not the entire statement 
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

def identify_column_references(model_hash: str, model_schema: Dict, expr_sql: str, dialect: str) -> str:
    """
    Parses individual SQL expression returning fully expressed column references to model aliases
    >> Given: 
        model_hash = "model"
        model_schema = {model_hash: {"column_a": "INT", "column_b": "TEXT"}}
        expr_sql = 'max(column_a) + count(distinct column_b)'
    >> Returns: 
        MAX("model"."column_a") + COUNT(DISTINCT "model"."column_b") AS "380ea7fef19ed53b"
    """
    query = exp.select(parse_one(expr_sql, read=dialect)).from_(model_hash)
    qualified = qualify.qualify(query, schema=model_schema)
    qualified_str = qualified.expressions[0].sql(identify=True)
    return qualified_str.replace(' AS "_col_0"', '')


def schema_from_sql(sqlglot_dialect: str, sql: str, schema: dict, model_hash) -> dict:
    """
    Uses input schema plus sql to produce the new schema expected from the query. 
    >>> Given:
        sql = "select a + 1 as a1, cast(upper(b) as int) as b1, upper(b) as b11, * from t"
        schema = MappingSchema( schema={"t": {"a": "INT", "b": "TEXT"}})
        model_hash = "model"
    >>> Expect: 
            {'model': {'a1': 'INT', 'b1': 'INT', 'b11': 'VARCHAR', 'a': 'INT', 'b': 'TEXT'}}

    """
    # 1. Parse
    expr = sqlglot.parse_one(sql, read=sqlglot_dialect)

    # 2. Qualify with schema so column refs resolve
    schema = MappingSchema(schema=schema)
    expr = qualify.qualify(expr, qualify_columns= True, schema=schema)

    # 3. Optimize which annotates types using the schema including stars
    expr = optimize(expr, schema=schema)
    

    # 4. Get output columns and types from the select list
    column_schema = {}
    select = expr.find(exp.Select)
    for proj in select.expressions:
        alias = proj.alias_or_name
        dtype = proj.type  # sqlglot.exp.DataType
        column_schema[alias] = dtype.this.value if dtype else None

    result = {
        model_hash: column_schema
    }
    return result 