"""
Column lineage extraction using SQLGlot for model SQL analysis.

This module parses SQL statements to extract:
- Output columns from SELECT statements
- Input columns from source tables
- Table references and dependencies

Example usage:
    >>> from visivo.query.column_lineage import extract_column_lineage
    >>>
    >>> sql = '''
    ...     SELECT
    ...         u.id,
    ...         u.name,
    ...         COUNT(o.order_id) as order_count
    ...     FROM users u
    ...     JOIN orders o ON u.id = o.user_id
    ...     GROUP BY u.id, u.name
    ... '''
    >>>
    >>> lineage = extract_column_lineage(sql)
    >>>
    >>> # Output columns
    >>> for col in lineage.output_columns:
    ...     print(f"{col.name}: computed={col.is_computed}")
    id: computed=False
    name: computed=False
    order_count: computed=True
    >>>
    >>> # Table references
    >>> for ref in lineage.table_references:
    ...     print(f"Table: {ref.name}, Alias: {ref.alias}")
    Table: users, Alias: u
    Table: orders, Alias: o
"""

from typing import Dict, List, Set, Optional, Tuple, Any
from dataclasses import dataclass, field
import sqlglot
from sqlglot import exp
from visivo.query.sqlglot_utils import get_sqlglot_dialect, parse_expression


@dataclass
class ColumnInfo:
    """Information about a column in the lineage."""

    name: str
    alias: Optional[str] = None
    data_type: Optional[str] = None
    expression: Optional[str] = None
    is_computed: bool = False
    source_table: Optional[str] = None
    source_column: Optional[str] = None


@dataclass
class TableReference:
    """Reference to a table or model used in SQL."""

    name: str
    alias: Optional[str] = None
    database: Optional[str] = None
    schema: Optional[str] = None
    is_cte: bool = False

    @property
    def full_name(self) -> str:
        """Get fully qualified table name."""
        parts = []
        if self.database:
            parts.append(self.database)
        if self.schema:
            parts.append(self.schema)
        parts.append(self.name)
        return ".".join(parts)


@dataclass
class ColumnLineage:
    """Result of column lineage extraction."""

    output_columns: List[ColumnInfo] = field(default_factory=list)
    input_columns: List[ColumnInfo] = field(default_factory=list)
    table_references: List[TableReference] = field(default_factory=list)
    cte_definitions: Dict[str, "ColumnLineage"] = field(default_factory=dict)
    errors: List[str] = field(default_factory=list)


class ColumnLineageExtractor:
    """Extract column lineage from SQL statements using SQLGlot."""

    def __init__(
        self, dialect: Optional[str] = None, schema_info: Optional[Dict[str, Dict[str, str]]] = None
    ):
        """
        Initialize the column lineage extractor.

        Args:
            dialect: SQL dialect (e.g., 'postgresql', 'snowflake', 'bigquery')
            schema_info: Optional schema information for star expansion
                        Format: {table_name: {column_name: data_type}}
        """
        self.dialect = get_sqlglot_dialect(dialect) if dialect else None
        self.schema_info = schema_info or {}

    def extract_lineage(self, sql: str) -> ColumnLineage:
        """
        Extract column lineage from a SQL statement.

        Args:
            sql: SQL statement to analyze

        Returns:
            ColumnLineage object with extracted information
        """
        lineage = ColumnLineage()

        # Parse the SQL statement
        try:
            ast = parse_expression(sql, self.dialect)
            if not ast:
                lineage.errors.append(
                    "Failed to parse SQL statement: empty or invalid SQL provided"
                )
                return lineage
        except Exception as e:
            lineage.errors.append(f"SQL parsing error: {str(e)}")
            return lineage

        # Process CTEs first
        self._extract_ctes(ast, lineage)

        # Extract main query components
        if isinstance(ast, exp.Select):
            self._extract_from_select(ast, lineage)
        elif isinstance(ast, (exp.Union, exp.Intersect, exp.Except)):
            # Handle set operations
            for query in ast.find_all(exp.Select):
                self._extract_from_select(query, lineage)

        return lineage

    def _extract_ctes(self, ast: exp.Expression, lineage: ColumnLineage) -> None:
        """Extract and process CTEs (Common Table Expressions)."""
        for cte in ast.find_all(exp.CTE):
            # Handle CTE name/alias safely
            cte_name = None
            if cte.alias:
                if isinstance(cte.alias, str):
                    cte_name = cte.alias
                elif hasattr(cte.alias, "name"):
                    cte_name = cte.alias.name
                else:
                    cte_name = str(cte.alias)

            if not cte_name:
                lineage.errors.append("CTE found without a name/alias")
                continue

            # Recursively extract lineage for the CTE
            cte_lineage = ColumnLineage()
            if cte.this and isinstance(cte.this, exp.Select):
                self._extract_from_select(cte.this, cte_lineage)

            lineage.cte_definitions[cte_name] = cte_lineage

            # Add CTE as a table reference
            lineage.table_references.append(TableReference(name=cte_name, is_cte=True))

    def _extract_from_select(self, select: exp.Select, lineage: ColumnLineage) -> None:
        """Extract columns and tables from a SELECT statement."""
        # Extract output columns from SELECT clause
        self._extract_output_columns(select, lineage)

        # Extract table references from FROM clause
        self._extract_table_references(select, lineage)

        # Extract input columns from WHERE, JOIN, GROUP BY, etc.
        self._extract_input_columns(select, lineage)

    def _extract_output_columns(self, select: exp.Select, lineage: ColumnLineage) -> None:
        """Extract output columns from SELECT clause."""
        if not select.expressions:
            return

        for expr in select.expressions:
            if isinstance(expr, exp.Star):
                # Handle SELECT *
                self._expand_star(select, lineage)
            elif isinstance(expr, exp.Alias):
                # Column with alias
                # Handle alias safely
                alias_name = None
                if expr.alias:
                    alias_name = expr.alias if isinstance(expr.alias, str) else str(expr.alias)
                else:
                    # Generate a default name for unnamed expressions
                    alias_name = f"column_{len(lineage.output_columns) + 1}"

                col_info = ColumnInfo(
                    name=alias_name,
                    expression=expr.this.sql() if expr.this else None,
                    is_computed=not isinstance(expr.this, exp.Column),
                )
                lineage.output_columns.append(col_info)
            elif isinstance(expr, exp.Column):
                # Simple column reference
                col_info = ColumnInfo(
                    name=self._get_column_name(expr),
                    source_table=getattr(expr, "table", None),
                    source_column=self._get_column_name(expr),
                )
                lineage.output_columns.append(col_info)
            else:
                # Complex expression without alias
                col_info = ColumnInfo(name=expr.sql(), expression=expr.sql(), is_computed=True)
                lineage.output_columns.append(col_info)

    def _expand_star(self, select: exp.Select, lineage: ColumnLineage) -> None:
        """Expand SELECT * based on available schema information."""
        # Get table references from FROM clause
        from_tables = self._get_from_tables(select)

        for table_ref in from_tables:
            table_name = table_ref.name

            # Check if we have schema info for this table
            if table_name in self.schema_info:
                for col_name, col_type in self.schema_info[table_name].items():
                    col_info = ColumnInfo(
                        name=col_name,
                        data_type=col_type,
                        source_table=table_name,
                        source_column=col_name,
                    )
                    lineage.output_columns.append(col_info)
            else:
                # No schema info, add placeholder
                lineage.output_columns.append(
                    ColumnInfo(
                        name="*",
                        expression=f"All columns from {table_name}",
                        source_table=table_name,
                    )
                )

    def _extract_table_references(self, select: exp.Select, lineage: ColumnLineage) -> None:
        """Extract table references from FROM and JOIN clauses."""
        # Extract from FROM clause
        if select.args.get("from"):
            from_expr = select.args["from"]
            self._extract_tables_from_expression(from_expr, lineage)

        # Extract from JOIN clauses
        for join in select.find_all(exp.Join):
            if join.this:
                self._extract_tables_from_expression(join.this, lineage)

        # Extract table references from subqueries (but not their output columns)
        for subquery in select.find_all(exp.Subquery):
            if subquery.this and isinstance(subquery.this, exp.Select):
                # Only extract table references, not output columns
                self._extract_table_references(subquery.this, lineage)
                self._extract_input_columns(subquery.this, lineage)

    def _extract_tables_from_expression(self, expr: exp.Expression, lineage: ColumnLineage) -> None:
        """Extract table references from an expression."""
        for table in expr.find_all(exp.Table):
            # SQLGlot uses 'catalog' for database and 'db' for schema
            table_ref = TableReference(
                name=table.name if hasattr(table, "name") else str(table.this),
                alias=table.alias if hasattr(table, "alias") and table.alias else None,
                database=table.catalog if hasattr(table, "catalog") else None,
                schema=table.db if hasattr(table, "db") else None,
            )

            # Check if it's a CTE reference
            if table_ref.name in lineage.cte_definitions:
                table_ref.is_cte = True

            lineage.table_references.append(table_ref)

    def _extract_input_columns(self, select: exp.Select, lineage: ColumnLineage) -> None:
        """Extract input columns used in WHERE, JOIN, GROUP BY, etc."""
        input_cols = set()

        # Extract from WHERE clause
        if select.args.get("where"):
            for col in select.args["where"].find_all(exp.Column):
                input_cols.add(self._create_column_info(col))

        # Extract from JOIN conditions
        for join in select.find_all(exp.Join):
            if join.args.get("on"):
                for col in join.args["on"].find_all(exp.Column):
                    input_cols.add(self._create_column_info(col))

        # Extract from GROUP BY
        if select.args.get("group"):
            for col in select.args["group"].find_all(exp.Column):
                input_cols.add(self._create_column_info(col))

        # Extract from HAVING
        if select.args.get("having"):
            for col in select.args["having"].find_all(exp.Column):
                input_cols.add(self._create_column_info(col))

        # Extract from ORDER BY
        if select.args.get("order"):
            for col in select.args["order"].find_all(exp.Column):
                input_cols.add(self._create_column_info(col))

        # Convert set to list, avoiding duplicates
        for col_tuple in input_cols:
            col_info = ColumnInfo(
                name=col_tuple[0], source_table=col_tuple[1], source_column=col_tuple[0]
            )
            lineage.input_columns.append(col_info)

    def _create_column_info(self, col: exp.Column) -> Tuple[str, Optional[str]]:
        """Create a tuple of (column_name, table_name) for deduplication."""
        col_name = self._get_column_name(col)
        table_name = col.table if hasattr(col, "table") else None
        return (col_name, table_name)

    def _get_column_name(self, col: exp.Column) -> str:
        """Extract column name from a Column expression."""
        if hasattr(col, "this"):
            if isinstance(col.this, exp.Identifier):
                return col.this.this if hasattr(col.this, "this") else str(col.this)
            return str(col.this)
        return str(col)

    def _get_from_tables(self, select: exp.Select) -> List[TableReference]:
        """Get table references from FROM clause."""
        tables = []

        if select.args.get("from"):
            from_expr = select.args["from"]
            for table in from_expr.find_all(exp.Table):
                # SQLGlot uses 'catalog' for database and 'db' for schema
                table_ref = TableReference(
                    name=table.name if hasattr(table, "name") else str(table.this),
                    alias=table.alias if hasattr(table, "alias") and table.alias else None,
                    database=table.catalog if hasattr(table, "catalog") else None,
                    schema=table.db if hasattr(table, "db") else None,
                )
                tables.append(table_ref)

        return tables


def extract_column_lineage(
    sql: str, dialect: Optional[str] = None, schema_info: Optional[Dict[str, Dict[str, str]]] = None
) -> ColumnLineage:
    """
    Convenience function to extract column lineage from SQL.

    Args:
        sql: SQL statement to analyze
        dialect: SQL dialect (e.g., 'postgresql', 'snowflake', 'bigquery')
        schema_info: Optional schema information for star expansion
                    Format: {table_name: {column_name: data_type}}

    Returns:
        ColumnLineage object with extracted information
    """
    extractor = ColumnLineageExtractor(dialect=dialect, schema_info=schema_info)
    return extractor.extract_lineage(sql)
