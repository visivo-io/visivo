"""
Custom exception for SQL validation errors with rich context.

Provides actionable error messages that connect SQLGlot parsing errors
back to Visivo configuration objects (insights, props, interactions).

Inspired by the LineValidationError pattern in visivo/parsers/line_validation_error.py
"""

from sqlglot.errors import ParseError
from typing import Optional, Dict


class SqlValidationError(Exception):
    """
    Enhanced SQL validation error that connects SQLGlot parsing errors
    back to Visivo configuration objects for actionable error messages.

    This class formats SQLGlot parse errors with full context about which
    Visivo object (insight, query type, props) caused the error, making it
    easy for users to debug their configuration.
    """

    def __init__(
        self,
        sqlglot_error: ParseError,
        query_sql: str,
        insight_name: str,
        query_type: str,
        dialect: str,
        context: Optional[Dict] = None,
    ):
        """
        Create a SQL validation error with full context.

        Args:
            sqlglot_error: The original SQLGlot ParseError
            query_sql: The SQL query that failed to parse
            insight_name: Name of the insight that generated this query
            query_type: Type of query ("pre_query" or "post_query")
            dialect: SQL dialect being validated (e.g., "duckdb", "postgres")
            context: Additional context dict (models, props, interactions, etc.)
        """
        self.sqlglot_error = sqlglot_error
        self.query_sql = query_sql
        self.insight_name = insight_name
        self.query_type = query_type
        self.dialect = dialect
        self.context = context or {}
        super().__init__(str(self))

    def __str__(self):
        """
        Format error message with full context for user debugging.

        Returns a multi-line formatted error message showing:
        - Which insight failed
        - Query type and dialect
        - Additional context (models, props, etc.)
        - Original SQLGlot error
        - Full generated SQL with line numbers
        - Troubleshooting tips
        """
        lines = []
        lines.append("=" * 80)
        lines.append("SQL VALIDATION ERROR")
        lines.append("=" * 80)
        lines.append("")

        # Insight context
        lines.append(f"Insight: {self.insight_name}")
        lines.append(f"Query Type: {self.query_type}")
        lines.append(f"Dialect: {self.dialect}")

        # Additional context (prop paths, interactions, models, etc.)
        if self.context:
            lines.append("")
            lines.append("Context:")
            for key, value in self.context.items():
                # Format list values nicely
                if isinstance(value, list):
                    value_str = ", ".join(str(v) for v in value)
                    lines.append(f"  - {key}: [{value_str}]")
                else:
                    lines.append(f"  - {key}: {value}")

        lines.append("")
        lines.append("-" * 80)
        lines.append("SQLGlot Error:")
        lines.append("-" * 80)
        lines.append(str(self.sqlglot_error))

        # Show query snippet with line numbers
        lines.append("")
        lines.append("-" * 80)
        lines.append("Generated SQL Query:")
        lines.append("-" * 80)
        query_lines = self.query_sql.split("\n")
        for i, line in enumerate(query_lines, 1):
            lines.append(f"{i:4d} | {line}")

        lines.append("")
        lines.append("=" * 80)
        lines.append("TROUBLESHOOTING TIPS:")
        lines.append("=" * 80)
        lines.append("1. Check your insight configuration for syntax errors in props/interactions")
        lines.append("2. Verify all ${ref()} references are spelled correctly")
        lines.append("3. Ensure metrics/dimensions use valid SQL expressions")
        lines.append("4. Check that filter/split/sort interactions use valid SQL syntax")
        lines.append("5. Look for unmatched parentheses, quotes, or missing commas")
        lines.append("=" * 80)

        return "\n".join(lines)
