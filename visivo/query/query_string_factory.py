from visivo.models.tokenized_trace import TokenizedTrace
from visivo.query.sql_validator import get_sqlglot_dialect
import sqlglot
from sqlglot import exp
from typing import List, Optional


class QueryStringFactory:
    def __init__(self, tokenized_trace: TokenizedTrace):
        self.tokenized_trace = tokenized_trace
        self.dialect = get_sqlglot_dialect(tokenized_trace.source_type)

    def build(self) -> str:
        """Build SQL query using SQLGlot AST construction."""
        
        # Build the main SELECT query
        main_query = self._build_main_select()
        
        # Add CTEs to the main query
        main_query = self._add_ctes(main_query)
        
        # Generate SQL with source comment
        sql_result = main_query.sql(dialect=self.dialect, pretty=True)
        
        # Handle QUALIFY clause by post-processing if needed
        if self._has_window_filters() and self._supports_qualify():
            sql_result = self._add_qualify_to_sql(sql_result)
        
        sql_result += f"\n-- source: {self.tokenized_trace.source}"
        
        return sql_result
    
    def _build_main_select(self) -> exp.Select:
        """Build the main SELECT statement."""
        query = exp.Select()
        
        # Add SELECT items
        if self.tokenized_trace.select_items:
            for key, value in self.tokenized_trace.select_items.items():
                query = query.select(
                    exp.Alias(
                        this=self._parse_expression(value),
                        alias=self._get_column_alias(key)
                    )
                )
        else:
            query = query.select(exp.Star())
        
        # Always add cohort_on column
        query = query.select(self._get_cohort_on_identifier())
        
        # Set FROM clause
        query = query.from_(exp.Identifier(this="columnize_cohort_on"))
        
        # Add WHERE clause
        if self._has_vanilla_filters():
            where_expr = self._build_where_clause()
            if where_expr:
                query = query.where(where_expr)
        
        # Add GROUP BY clause
        group_by_exprs = self._build_group_by_expressions()
        if group_by_exprs:
            query = query.group_by(*group_by_exprs)
        
        # Add HAVING clause
        if self._has_aggregate_filters():
            having_expr = self._build_having_clause()
            if having_expr:
                query = query.having(having_expr)
        
        # Add QUALIFY clause (for supported dialects)
        # We'll handle QUALIFY by post-processing the generated SQL since SQLGlot may not support it directly
        
        # Add ORDER BY clause
        if self.tokenized_trace.order_by:
            order_exprs = []
            for order_expr in self.tokenized_trace.order_by:
                # Parse ORDER BY expression by wrapping in a SELECT statement
                temp_query = f"SELECT 1 ORDER BY {order_expr}"
                parsed_query = sqlglot.parse_one(temp_query, dialect=self.dialect)
                if parsed_query.args.get('order') and parsed_query.args['order'].expressions:
                    order_exprs.extend(parsed_query.args['order'].expressions)
            
            if order_exprs:
                query = query.order_by(*order_exprs)
        
        return query
    
    def _add_ctes(self, main_query: exp.Select) -> exp.Select:
        """Add CTEs to the main query."""
        # Create base_query CTE
        base_cte = exp.CTE(
            this=self._parse_expression(self.tokenized_trace.sql),
            alias=exp.TableAlias(this=exp.Identifier(this="base_query"))
        )
        
        # Create columnize_cohort_on CTE
        cohort_cte_select = (
            exp.Select()
            .select(exp.Star())
            .select(
                exp.Alias(
                    this=self._parse_expression(self.tokenized_trace.cohort_on),
                    alias=self._get_cohort_on_identifier()
                )
            )
            .from_(exp.Identifier(this="base_query"))
        )
        
        cohort_cte = exp.CTE(
            this=cohort_cte_select,
            alias=exp.TableAlias(this=exp.Identifier(this="columnize_cohort_on"))
        )
        
        # Create WITH clause properly
        with_clause = exp.With(expressions=[base_cte, cohort_cte])
        main_query = main_query.copy()
        main_query.set("with", with_clause)
        
        return main_query
    
    def _parse_expression(self, expr_str: str) -> exp.Expression:
        """Parse a SQL expression string into SQLGlot AST."""
        return sqlglot.parse_one(expr_str, dialect=self.dialect)
    
    def _get_column_alias(self, key: str) -> exp.Identifier:
        """Get properly formatted column alias based on source type."""
        if self.tokenized_trace.source_type == "bigquery":
            # Replace dots with pipes for BigQuery
            formatted_key = key.replace(".", "|")
            return exp.Identifier(this=formatted_key, quoted=True)
        else:
            return exp.Identifier(this=key, quoted=True)
    
    def _get_cohort_on_identifier(self) -> exp.Identifier:
        """Get cohort_on column identifier with proper quoting."""
        return exp.Identifier(this="cohort_on", quoted=True)
    
    def _has_vanilla_filters(self) -> bool:
        """Check if there are vanilla filters."""
        return (
            self.tokenized_trace.filter_by
            and isinstance(self.tokenized_trace.filter_by, dict)
            and "vanilla" in self.tokenized_trace.filter_by
            and self.tokenized_trace.filter_by["vanilla"]
        )
    
    def _has_aggregate_filters(self) -> bool:
        """Check if there are aggregate filters."""
        return (
            self.tokenized_trace.filter_by
            and isinstance(self.tokenized_trace.filter_by, dict)
            and "aggregate" in self.tokenized_trace.filter_by
            and self.tokenized_trace.filter_by["aggregate"]
        )
    
    def _has_window_filters(self) -> bool:
        """Check if there are window filters."""
        return (
            self.tokenized_trace.filter_by
            and isinstance(self.tokenized_trace.filter_by, dict)
            and "window" in self.tokenized_trace.filter_by
            and self.tokenized_trace.filter_by["window"]
        )
    
    def _supports_qualify(self) -> bool:
        """Check if the dialect supports QUALIFY clause."""
        return self.tokenized_trace.source_type in ["bigquery", "snowflake"]
    
    def _build_where_clause(self) -> Optional[exp.Expression]:
        """Build WHERE clause from vanilla filters."""
        if not self._has_vanilla_filters():
            return None
        
        conditions = []
        for filter_expr in self.tokenized_trace.filter_by["vanilla"]:
            conditions.append(self._parse_expression(filter_expr))
        
        if not conditions:
            return None
        
        # Combine with AND
        result = conditions[0]
        for condition in conditions[1:]:
            result = exp.And(this=result, expression=condition)
        
        return result
    
    def _build_having_clause(self) -> Optional[exp.Expression]:
        """Build HAVING clause from aggregate filters."""
        if not self._has_aggregate_filters():
            return None
        
        conditions = []
        for filter_expr in self.tokenized_trace.filter_by["aggregate"]:
            conditions.append(self._parse_expression(filter_expr))
        
        if not conditions:
            return None
        
        # Combine with AND
        result = conditions[0]
        for condition in conditions[1:]:
            result = exp.And(this=result, expression=condition)
        
        return result
    
    def _build_qualify_clause(self) -> Optional[exp.Expression]:
        """Build QUALIFY clause from window filters."""
        if not self._has_window_filters():
            return None
        
        conditions = []
        for filter_expr in self.tokenized_trace.filter_by["window"]:
            conditions.append(self._parse_expression(filter_expr))
        
        if not conditions:
            return None
        
        # Combine with AND
        result = conditions[0]
        for condition in conditions[1:]:
            result = exp.And(this=result, expression=condition)
        
        return result
    
    def _build_group_by_expressions(self) -> List[exp.Expression]:
        """Build GROUP BY expressions."""
        group_by_exprs = []
        
        # Add explicit groupby statements (excluding invalid ones)
        if self.tokenized_trace.groupby_statements:
            for stmt in self.tokenized_trace.groupby_statements:
                # Strip whitespace and trailing commas
                clean_stmt = stmt.strip().rstrip(",")
                # Skip invalid '*' statements in GROUP BY
                if clean_stmt and clean_stmt != "*":
                    group_by_exprs.append(self._parse_expression(clean_stmt))
        
        # Always add cohort_on if we need GROUP BY
        if (
            self.tokenized_trace.groupby_statements 
            or self.tokenized_trace.cohort_on != "'values'"
        ):
            group_by_exprs.append(self._get_cohort_on_identifier())
        
        return group_by_exprs
    
    def _add_qualify_to_sql(self, sql: str) -> str:
        """Add QUALIFY clause to generated SQL by post-processing."""
        if not self._has_window_filters():
            return sql
        
        # Build QUALIFY clause text
        qualify_conditions = []
        for filter_expr in self.tokenized_trace.filter_by["window"]:
            qualify_conditions.append(f"  {filter_expr}")
        
        qualify_clause = "QUALIFY\n" + " AND ".join(qualify_conditions)
        
        # Insert QUALIFY clause before ORDER BY if it exists, otherwise before final comment
        lines = sql.split('\n')
        
        # Find insertion point (before ORDER BY or at the end)
        insert_index = len(lines)
        for i, line in enumerate(lines):
            if line.strip().startswith('ORDER BY'):
                insert_index = i
                break
        
        # Insert QUALIFY clause
        lines.insert(insert_index, qualify_clause)
        
        return '\n'.join(lines)
