from visivo.models.tokenized_trace import TokenizedTrace
from visivo.query.sql_validator import get_sqlglot_dialect
import sqlglot
from sqlglot import exp


class QueryStringFactory:
    def __init__(self, tokenized_trace: TokenizedTrace):
        self.tokenized_trace = tokenized_trace
        self.dialect = get_sqlglot_dialect(tokenized_trace.source_type)

    def build(self):
        # Build SQL using string concatenation with SQLGlot for individual components
        parts = []

        # Column quotation based on source type
        if self.tokenized_trace.source_type == "bigquery":
            column_quotation = "`"
        else:
            column_quotation = '"'

        # WITH clause
        parts.append("WITH")
        parts.append("base_query AS (")
        parts.append(f"  {self.tokenized_trace.sql}")
        parts.append("),")
        parts.append("columnize_cohort_on AS (")
        parts.append("  SELECT")
        parts.append("    *,")
        parts.append(
            f"    {self.tokenized_trace.cohort_on} AS {column_quotation}cohort_on{column_quotation}"
        )
        parts.append("  FROM base_query")
        parts.append(")")

        # Main SELECT
        parts.append("SELECT")

        # SELECT items
        if self.tokenized_trace.select_items:
            select_items = []
            for key, value in self.tokenized_trace.select_items.items():
                formatted_alias = self._format_column_alias(key)
                select_items.append(f"  {value} AS {formatted_alias}")
            parts.append(",\n".join(select_items) + ",")
        else:
            parts.append("  *,")

        # Add cohort_on column
        parts.append(f"  {column_quotation}cohort_on{column_quotation}")

        # FROM clause
        parts.append("FROM columnize_cohort_on")

        # WHERE clause (vanilla filters)
        if (
            self.tokenized_trace.filter_by
            and hasattr(self.tokenized_trace.filter_by, "vanilla")
            and self.tokenized_trace.filter_by.vanilla
        ):
            parts.append("WHERE")
            where_conditions = []
            for filter_expr in self.tokenized_trace.filter_by.vanilla:
                where_conditions.append(f"  {filter_expr}")
            parts.append(" AND ".join(where_conditions))

        # GROUP BY clause
        if self.tokenized_trace.groupby_statements or self.tokenized_trace.cohort_on != "'values'":
            parts.append("GROUP BY")
            group_by_items = []
            if self.tokenized_trace.groupby_statements:
                for stmt in self.tokenized_trace.groupby_statements:
                    group_by_items.append(f"  {stmt}")
            group_by_items.append(f"  {column_quotation}cohort_on{column_quotation}")
            parts.append(",\n".join(group_by_items))

        # HAVING clause (aggregate filters)
        if (
            self.tokenized_trace.filter_by
            and hasattr(self.tokenized_trace.filter_by, "aggregate")
            and self.tokenized_trace.filter_by.aggregate
        ):
            parts.append("HAVING")
            having_conditions = []
            for filter_expr in self.tokenized_trace.filter_by.aggregate:
                having_conditions.append(f"  {filter_expr}")
            parts.append(" AND ".join(having_conditions))

        # QUALIFY clause (window filters) - only for supported dialects
        if (
            self.tokenized_trace.filter_by
            and hasattr(self.tokenized_trace.filter_by, "window")
            and self.tokenized_trace.filter_by.window
        ):
            if self.tokenized_trace.source_type in ["bigquery", "snowflake"]:
                parts.append("QUALIFY")
                qualify_conditions = []
                for filter_expr in self.tokenized_trace.filter_by.window:
                    qualify_conditions.append(f"  {filter_expr}")
                parts.append(" AND ".join(qualify_conditions))

        # ORDER BY clause
        if self.tokenized_trace.order_by:
            parts.append("ORDER BY")
            order_by_items = []
            for order_expr in self.tokenized_trace.order_by:
                order_by_items.append(f"  {order_expr}")
            parts.append(",\n".join(order_by_items))

        # Source comment
        parts.append(f"-- source: {self.tokenized_trace.source}")

        return "\n".join(parts)

    def _format_column_alias(self, key: str) -> str:
        """Get properly formatted column alias based on source type"""
        if self.tokenized_trace.source_type == "bigquery":
            # Replace dots with pipes for BigQuery
            formatted_key = key.replace(".", "|")
            return f"`{formatted_key}`"
        else:
            return f'"{key}"'
