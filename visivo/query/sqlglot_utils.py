"""
SQLGlot utility functions for AST analysis and SQL building.
"""

import sqlglot
from sqlglot import exp, parse_one
from sqlglot.schema import MappingSchema
from sqlglot.dialects import Dialects
from sqlglot.optimizer import optimize
from typing import List, Set, Optional, Tuple, Dict
from visivo.models.base.named_model import alpha_hash
from sqlglot.optimizer import qualify


from visivo.models.base.context_string import ContextString


# Map divergent Visivo source types to SQLGlot dialect names
VISIVO_TO_SQLGLOT_DIALECT = {
    "postgresql": "postgres",
}


def get_sqlglot_dialect(visivo_dialect: str) -> str:
    """Convert Visivo dialect name to SQLGlot dialect name."""
    sqlglot_dialects = [i.value for i in Dialects if i != ""]
    if visivo_dialect in sqlglot_dialects:
        return visivo_dialect
    else:
        mapped_sqlglot_dialect = VISIVO_TO_SQLGLOT_DIALECT.get(visivo_dialect)

        if mapped_sqlglot_dialect:
            return mapped_sqlglot_dialect
        else:
            raise NotImplementedError(f"Dialect {visivo_dialect} not found in SQLglot map.")


def normalize_identifier_for_dialect(
    identifier: str, dialect: str, quoted: bool = True
) -> exp.Identifier:
    """
    Create a properly-cased identifier for the target dialect.

    Different SQL dialects have different case-folding rules for identifiers:
    - Snowflake: unquoted identifiers are stored as UPPERCASE
    - PostgreSQL: unquoted identifiers are stored as lowercase
    - MySQL/BigQuery/DuckDB: case is generally preserved

    When we quote identifiers, the case must match how the database stores them.
    For Snowflake, quoted lowercase "column" won't match stored COLUMN.

    Args:
        identifier: The identifier string (table name, column name, alias)
        dialect: Visivo dialect name (e.g., "snowflake", "postgresql", "mysql")
        quoted: Whether to quote the identifier (default True)

    Returns:
        exp.Identifier with proper casing for the dialect
    """
    sqlglot_dialect = get_sqlglot_dialect(dialect) if dialect else None

    if sqlglot_dialect == "snowflake":
        # Snowflake stores unquoted identifiers as UPPERCASE
        normalized = identifier.upper()
    elif sqlglot_dialect == "postgres":
        # PostgreSQL stores unquoted identifiers as lowercase
        normalized = identifier.lower()
    else:
        # MySQL, BigQuery, DuckDB - preserve case
        normalized = identifier

    return exp.Identifier(this=normalized, quoted=quoted)


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


def find_non_aggregated_expressions(expr: exp.Expression, dialect: str = None) -> List[str]:
    """
    Find all column references that are not inside aggregate functions.
    These columns need to be included in GROUP BY.

    Args:
        expr: SQLGlot AST expression
        dialect: SQLGlot dialect name for proper identifier quoting (optional)

    Returns:
        List of column expressions that are not aggregated
    """
    non_aggregated = set()

    # Get SQLGlot dialect for proper identifier quoting
    sqlglot_dialect = get_sqlglot_dialect(dialect) if dialect else None

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

            # Generate SQL with dialect-appropriate identifier quoting
            non_aggregated.add(column_expr.sql(dialect=sqlglot_dialect))

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


def identify_column_references(
    model_hash: str, model_schema: Dict, expr_sql: str, dialect: str
) -> str:
    """
    Parses individual SQL expression returning fully expressed column references to model aliases.

    Handles ASC/DESC sort modifiers by preserving them through the qualification process.
    When an expression like "column DESC" is passed, SQLGlot interprets DESC as an alias
    (not a sort modifier) when parsed outside of ORDER BY context. This function detects
    trailing ASC/DESC keywords and re-attaches them after qualifying the underlying expression.

    >> Given:
        model_hash = "model"
        model_schema = {model_hash: {"column_a": "INT", "column_b": "TEXT"}}
        expr_sql = 'max(column_a) + count(distinct column_b)'
    >> Returns:
        MAX("model"."column_a") + COUNT(DISTINCT "model"."column_b")

    >> Given (with sort order):
        expr_sql = 'column_a DESC'
    >> Returns:
        "model"."column_a" DESC
    """
    sqlglot_dialect = get_sqlglot_dialect(dialect) if dialect else None

    # Detect and extract trailing ASC/DESC before parsing
    # SQLGlot parses "column DESC" as Alias(column, "DESC") when outside ORDER BY context
    # so we need to strip ASC/DESC at the string level first
    sort_order = None
    expr_sql_stripped = expr_sql.strip()
    upper_stripped = expr_sql_stripped.upper()

    if upper_stripped.endswith(" DESC"):
        sort_order = "DESC"
        expr_sql_stripped = expr_sql_stripped[:-5].strip()
    elif upper_stripped.endswith(" ASC"):
        sort_order = "ASC"
        expr_sql_stripped = expr_sql_stripped[:-4].strip()

    # Parse the expression (without sort order)
    parsed = parse_one(expr_sql_stripped, read=sqlglot_dialect)

    # For Snowflake, uppercase the model hash for the table reference
    # This ensures column qualifiers like "model_hash"."column" match the CTE alias casing
    # Snowflake stores unquoted identifiers as UPPERCASE, so we must use uppercase everywhere
    table_ref = model_hash.upper() if sqlglot_dialect == "snowflake" else model_hash

    # Build a SELECT query with the expression from the model_hash table
    query = exp.select(parsed).from_(table_ref)

    # Build schema for qualify - if Snowflake, we need uppercase table key to match table_ref
    if sqlglot_dialect == "snowflake":
        # Create schema with uppercase table key
        schema_for_qualify = {table_ref: model_schema.get(model_hash, {})}
    else:
        schema_for_qualify = model_schema

    # Wrap schema in MappingSchema for SQLGlot's qualify function
    schema = MappingSchema(schema=schema_for_qualify)
    qualified = qualify.qualify(query, qualify_columns=True, schema=schema)

    # Get the first expression and strip any alias
    # We need the qualified expression without alias for use in larger SQL statements
    first_expr = qualified.expressions[0]
    if isinstance(first_expr, exp.Alias):
        # If it's an Alias node, get the underlying expression
        first_expr = first_expr.this

    # For Snowflake, uppercase all identifiers before generating SQL.
    # Snowflake stores unquoted column names as uppercase (X, Y), but our schema
    # uses lowercase (x, y). SQLGlot's qualify.qualify() quotes identifiers, so
    # we need to uppercase them to match Snowflake's case-sensitive quoted lookup.
    if sqlglot_dialect == "snowflake":
        for identifier in first_expr.find_all(exp.Identifier):
            if identifier.this:
                identifier.args["this"] = identifier.this.upper()

    qualified_sql = first_expr.sql(dialect=sqlglot_dialect, identify=True)

    # Re-attach sort order if it was present in the original expression
    if sort_order is not None:
        qualified_sql = f"{qualified_sql} {sort_order}"

    return qualified_sql


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
    expr = qualify.qualify(expr, qualify_columns=True, schema=schema)

    # 3. Optimize which annotates types using the schema including stars
    expr = optimize(expr, schema=schema)

    # 4. Get output columns and types from the select list
    column_schema = {}
    select = expr.find(exp.Select)
    for proj in select.expressions:
        alias = proj.alias_or_name
        dtype = proj.type  # sqlglot.exp.DataType
        column_schema[alias] = dtype.this.value if dtype else None

    result = {model_hash: column_schema}
    return result


def field_alias_hasher(expression) -> str:
    return alpha_hash(expression, length=14)


def supports_qualify(dialect: str) -> bool:
    """
    Check if a SQL dialect supports the QUALIFY clause using SQLGlot.

    Args:
        dialect: SQLGlot dialect name

    Returns:
        True if the dialect supports QUALIFY clause, False otherwise
    """
    if not dialect:
        return False

    try:
        sqlglot_dialect = get_sqlglot_dialect(dialect)

        # Try to parse a simple query with QUALIFY
        test_query = """
        SELECT
            name,
            ROW_NUMBER() OVER (PARTITION BY category ORDER BY value DESC) as rn
        FROM test_table
        QUALIFY rn = 1
        """

        parsed = sqlglot.parse_one(test_query, read=sqlglot_dialect)

        # Check if QUALIFY clause was successfully parsed
        qualify_node = parsed.find(exp.Qualify)

        # If we found a QUALIFY node, the dialect supports it
        return qualify_node is not None

    except Exception:
        # If parsing fails or any error occurs, the dialect doesn't support QUALIFY
        return False


def strip_sort_order(expr_str: str, dialect: str = None) -> str:
    """
    Remove ASC/DESC ordering from a SQL expression.
    Useful for using ORDER BY expressions in SELECT or GROUP BY clauses.

    When expressions like "column DESC" are parsed outside of ORDER BY context,
    SQLGlot interprets DESC as an alias rather than a sort modifier. This function
    strips trailing ASC/DESC at the string level before parsing to handle this case.

    Args:
        expr_str: SQL expression string that may contain ASC/DESC
        dialect: SQLGlot dialect name (optional)

    Returns:
        Cleaned SQL expression without ASC/DESC ordering
    """
    if not expr_str or not expr_str.strip():
        return expr_str

    # Strip trailing ASC/DESC at string level first
    # SQLGlot parses "column DESC" as Alias(column, "DESC") outside ORDER BY context
    result = expr_str.strip()
    upper_result = result.upper()

    if upper_result.endswith(" DESC"):
        result = result[:-5].strip()
    elif upper_result.endswith(" ASC"):
        result = result[:-4].strip()

    return result


def validate_query(
    query_sql: str,
    dialect: str = "duckdb",
    insight_name: str = "unknown",
    query_type: str = "query",
    context: Optional[Dict] = None,
    raise_on_error: bool = True,
) -> Tuple[bool, Optional[str]]:
    """
    Validate SQL query using SQLGlot parser.

    Per SQLGLOT.md: SQLGlot provides robust SQL validation with detailed
    error messages including line/column information. This function validates
    that a SQL query is syntactically correct by attempting to parse it.

    This validation catches SQL errors at build time (during visivo run)
    rather than at runtime in the browser's DuckDB WASM engine, providing
    better error messages and preventing broken deployments.

    Args:
        query_sql: SQL query string to validate
        dialect: SQLGlot dialect name (e.g., "duckdb", "postgres", "bigquery")
        insight_name: Name of insight for error context (helps user debug)
        query_type: Type of query ("pre_query", "post_query", etc.)
        context: Additional error context dict (models, props, interactions)
        raise_on_error: If True, raises SqlValidationError on invalid SQL

    Returns:
        Tuple of (is_valid, error_message)
        - is_valid: True if query is valid, False otherwise
        - error_message: None if valid, error string if invalid

    Raises:
        SqlValidationError: If query is invalid and raise_on_error=True
            Contains full context for actionable error messages

    Example:
        >>> validate_query(
        ...     "SELECT * FROM users",
        ...     dialect="duckdb",
        ...     insight_name="user_stats",
        ...     query_type="post_query"
        ... )
        (True, None)

        >>> validate_query(
        ...     "SELECT * FROM WHERE",  # Invalid SQL
        ...     dialect="duckdb",
        ...     insight_name="user_stats",
        ...     query_type="post_query",
        ...     context={"props": ["props.x", "props.y"]}
        ... )
        SqlValidationError: ...with full formatted error...
    """
    from sqlglot.errors import ParseError
    from visivo.query.sql_validation_error import SqlValidationError

    # Empty queries are considered valid
    if not query_sql or not query_sql.strip():
        return True, None

    try:
        # Attempt to parse the query using SQLGlot
        # This validates SQL syntax according to the specified dialect
        parsed = parse_one(query_sql, read=dialect)

        if parsed is None:
            # parse_one returned None - query is invalid but no ParseError was raised
            error_msg = f"Failed to parse SQL for {insight_name} ({query_type})"
            if raise_on_error:
                # Create a basic ParseError for consistency
                raise SqlValidationError(
                    sqlglot_error=ParseError(error_msg),
                    query_sql=query_sql,
                    insight_name=insight_name,
                    query_type=query_type,
                    dialect=dialect,
                    context=context,
                )
            return False, error_msg

        # Query parsed successfully - it's valid SQL
        return True, None

    except ParseError as e:
        # SQLGlot raised a ParseError - query has syntax errors
        # The ParseError contains line/column information and detailed message
        if raise_on_error:
            # Wrap in SqlValidationError with full Visivo context
            raise SqlValidationError(
                sqlglot_error=e,
                query_sql=query_sql,
                insight_name=insight_name,
                query_type=query_type,
                dialect=dialect,
                context=context,
            ) from e
        # Don't raise, just return validation failure
        return False, str(e)
