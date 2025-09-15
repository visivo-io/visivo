from visivo.models.tokenized_trace import TokenizedTrace
import sqlglot


class QueryStringFactory:
    def __init__(self, tokenized_trace: TokenizedTrace):
        self.tokenized_trace = tokenized_trace

    def build(self) -> str:
        """Build the trace query using SQLGlot instead of Jinja template."""

        # Build the base CTE from the model SQL
        base_cte = sqlglot.parse_one(self.tokenized_trace.sql, dialect=self.tokenized_trace.dialect)

        # Build the columnize_cohort_on CTE
        # Parse the cohort_on expression and create an alias properly
        cohort_on_expr = sqlglot.parse_one(
            self.tokenized_trace.cohort_on, dialect=self.tokenized_trace.dialect
        )
        cohort_on_alias = sqlglot.exp.Alias(
            this=cohort_on_expr, alias=sqlglot.exp.Identifier(this="cohort_on", quoted=True)
        )

        cohort_on_select = sqlglot.select("*").select(cohort_on_alias).from_("base_query")

        # Build the main SELECT
        main_query = self._build_main_query()

        # Add CTEs
        final_query = main_query.with_("base_query", base_cte).with_(
            "columnize_cohort_on", cohort_on_select
        )

        # Generate SQL
        sql = final_query.sql(dialect=self.tokenized_trace.dialect)

        # Add source comment
        sql += f"\n-- source: {self.tokenized_trace.source}"

        return sql

    def _build_main_query(self):
        """Build the main SELECT query."""

        # Start with SELECT
        query = sqlglot.select()

        # Add select items
        if self.tokenized_trace.select_items:
            for key, value in self.tokenized_trace.select_items.items():
                # Parse the value expression
                value_expr = sqlglot.parse_one(value, dialect=self.tokenized_trace.dialect)

                # Format column alias
                if self.tokenized_trace.source_type == "bigquery":
                    # BigQuery uses backticks and replaces dots with pipes
                    alias_name = key.replace(".", "|")
                else:
                    alias_name = key

                # Create the aliased expression properly
                aliased_expr = sqlglot.exp.Alias(
                    this=value_expr, alias=sqlglot.exp.Identifier(this=alias_name, quoted=True)
                )

                # Add the select expression with alias
                query = query.select(aliased_expr)
        else:
            query = query.select("*")

        # Always add cohort_on - use proper identifier
        cohort_on_identifier = sqlglot.exp.Identifier(this="cohort_on", quoted=True)
        query = query.select(cohort_on_identifier)

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
            # Always group by cohort_on - use proper identifier
            cohort_on_identifier = sqlglot.exp.Identifier(this="cohort_on", quoted=True)
            query = query.group_by(cohort_on_identifier)

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
