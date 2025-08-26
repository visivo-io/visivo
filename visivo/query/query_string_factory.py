from visivo.models.tokenized_trace import TokenizedTrace
from visivo.query.sqlglot_utils import get_sqlglot_dialect
import sqlglot
from sqlglot import exp


class QueryStringFactory:
    def __init__(self, tokenized_trace: TokenizedTrace):
        self.tokenized_trace = tokenized_trace
        self.dialect = get_sqlglot_dialect(tokenized_trace.source_type)

    def build(self) -> str:
        """Build the trace query using SQLGlot instead of Jinja template."""

        # Determine column quotation based on dialect
        if self.tokenized_trace.source_type == "bigquery":
            column_quotation = "`"
        else:
            column_quotation = '"'

        # Build the base CTE from the model SQL
        base_cte = sqlglot.parse_one(self.tokenized_trace.sql, dialect=self.dialect)

        # Build the columnize_cohort_on CTE
        cohort_on_select = (
            sqlglot.select("*")
            .select(
                f"{self.tokenized_trace.cohort_on} AS {column_quotation}cohort_on{column_quotation}"
            )
            .from_("base_query")
        )

        # Build the main SELECT
        main_query = self._build_main_query(column_quotation)

        # Add CTEs
        final_query = main_query.with_("base_query", base_cte).with_(
            "columnize_cohort_on", cohort_on_select
        )

        # Generate SQL
        sql = final_query.sql(dialect=self.dialect)

        # Add source comment
        sql += f"\n-- source: {self.tokenized_trace.source}"

        return sql

    def _build_main_query(self, column_quotation: str):
        """Build the main SELECT query."""

        # Start with SELECT
        query = sqlglot.select()

        # Add select items
        if self.tokenized_trace.select_items:
            for key, value in self.tokenized_trace.select_items.items():
                # Format column alias
                if self.tokenized_trace.source_type == "bigquery":
                    # BigQuery uses backticks and replaces dots with pipes
                    alias = f"`{key.replace('.', '|')}`"
                else:
                    alias = f'"{key}"'

                # Add the select expression with alias
                query = query.select(f"{value} AS {alias}")
        else:
            query = query.select("*")

        # Always add cohort_on
        query = query.select(f"{column_quotation}cohort_on{column_quotation}")

        # FROM clause
        query = query.from_("columnize_cohort_on")

        # WHERE clause (vanilla filters)
        if self.tokenized_trace.filter_by and self.tokenized_trace.filter_by.get("vanilla"):
            for filter_expr in self.tokenized_trace.filter_by["vanilla"]:
                query = query.where(filter_expr)

        # GROUP BY clause
        if self.tokenized_trace.groupby_statements or self.tokenized_trace.cohort_on != "'values'":
            # Add all groupby statements
            if self.tokenized_trace.groupby_statements:
                for statement in self.tokenized_trace.groupby_statements:
                    query = query.group_by(statement)
            # Always group by cohort_on
            query = query.group_by(f"{column_quotation}cohort_on{column_quotation}")

        # HAVING clause (aggregate filters)
        if self.tokenized_trace.filter_by and self.tokenized_trace.filter_by.get("aggregate"):
            for filter_expr in self.tokenized_trace.filter_by["aggregate"]:
                query = query.having(filter_expr)

        # QUALIFY clause (window filters) - Snowflake only
        if (
            self.tokenized_trace.filter_by
            and self.tokenized_trace.filter_by.get("window")
            and self.tokenized_trace.source_type == "snowflake"
        ):
            # SQLGlot supports QUALIFY for Snowflake
            for filter_expr in self.tokenized_trace.filter_by["window"]:
                # Use raw SQL for QUALIFY since it's dialect-specific
                query = query.append("qualify", filter_expr)

        # ORDER BY clause
        if self.tokenized_trace.order_by:
            for order_expr in self.tokenized_trace.order_by:
                query = query.order_by(order_expr)

        return query
