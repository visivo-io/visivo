from visivo.query.insight.insight_query_info import InsightQueryInfo
from visivo.models.base.project_dag import ProjectDag
from visivo.query.sqlglot_utils import field_alias_hasher

from visivo.query.resolvers.field_resolver import FieldResolver
from visivo.query.relation_graph import RelationGraph
from visivo.query.sqlglot_utils import (
    find_non_aggregated_expressions,
    has_window_function,
    has_aggregate_function,
    supports_qualify,
    strip_sort_order,
    parse_expression,
    get_sqlglot_dialect,
)
from visivo.query.schema_aggregator import SchemaAggregator
from visivo.logger.logger import Logger
import sqlglot
from sqlglot import exp
from sqlglot.optimizer import qualify


class InsightQueryBuilder:
    """
    1. If the insight is NOT dynamic
      - need to return pre_query as the "main query"
      - Fully express query to run on a single source backend meanning full table references in model CTEs
      - Use native source dialect for the main query
      - mappings
    2. If the insight IS dynamic
      - Need to return post_query as the "main query" in "duckdb" dialect transpiling from native dialect
      - Resolve inputs with their place holder & ref comment in sql. No recursion needed since inputs cannot
        be in metrics/dimension they are always at the top level

    3. In all cases:
      - Need to express model CTEs named after the model hash name as the FieldResolver & ModelSchema expect
      - Have to collect all of the query statements from insight.props & insight.interactions
    """

    def __init__(self, insight, dag: ProjectDag, output_dir):
        self.logger = Logger.instance()
        self.dag = dag
        self.output_dir = output_dir
        self.insight_hash = insight.name_hash()
        self.unresolved_query_statements = insight.get_all_query_statements(dag)
        self.is_dyanmic = insight.is_dynamic(dag)
        self.models = insight.get_all_dependent_models(dag)
        source = insight.get_dependent_source(dag, output_dir)
        self.default_schema = source.db_schema
        self.default_database = source.database
        field_resolver = FieldResolver(
            dag=dag, output_dir=output_dir, native_dialect=source.get_sqlglot_dialect()
        )
        self.field_resolver = field_resolver
        self.relation_graph = RelationGraph(dag, field_resolver)

        self.main_query = None
        self.resolved_query_statements = None
        self.is_resolved = False

    @property
    def props_mapping(self):
        if not self.is_resolved:
            raise Exception("Need to resolve before accessing props_mapping")
        props_statements = [
            (key, statement) for key, statement in self.resolved_query_statements if "props." in key
        ]
        props_map = {}
        for key, statement in props_statements:
            props_map[key] = statement.split(" AS ")[1]
        return props_map

    @property
    def pre_query(self):
        if not self.is_resolved:
            raise Exception("Need to resolve before accessing pre_query")
        if self.is_dyanmic:
            return None
        else:
            return self._build_main_query()

    @property
    def post_query(self):
        if not self.is_resolved:
            raise Exception("Need to resolve before accessing pre_query")
        if self.is_dyanmic:
            return self._build_main_query()
        else:
            # Should be able to execute this in JS as long as we do the following-
            # await db.registerFileURL("insight_hash.parquet", "https://signed.file/call.parquet");
            return f"SELECT * FROM '{self.insight_hash}.parquet'"

    def resolve(self):
        """Sets the resolved_query_statements"""
        resolved_query_statements = []
        for key, statement in self.unresolved_query_statements:
            resolved_statement = self.field_resolver.resolve(expression=statement)
            resolved_query_statements.append((key, resolved_statement))
        self.resolved_query_statements = resolved_query_statements
        self.is_resolved = True

    def _build_main_query(self):
        """
        Pull all of the _build methods together adding them to a single sqlglot AST. This method should format the query
        and it should transpile it to duckdb if the query is dynamic because that's where the main query will run in that
        case. The _build methods should be writing sql in the native source dialect of the insight up till this point.
        """
        native_dialect = get_sqlglot_dialect(self.field_resolver.native_dialect)
        target_dialect = "duckdb" if self.is_dyanmic else native_dialect

        # Build all the query components
        ctes = self._build_ctes()
        select_expressions = self._build_main_select()
        from_table, joins = self._build_from_and_joins()
        where_clause = self._build_where_clause()
        group_by_expressions = self._build_group_by()
        having_clause = self._build_having()
        qualify_clause = self._build_qualify()
        order_by_expressions = self._build_order_by()

        # Start building the SELECT query
        query = exp.Select()

        # Add CTEs (WITH clause)
        if ctes:
            # Attach CTEs directly to the query
            query.set("with", exp.With(expressions=ctes))

        # Add SELECT expressions
        if select_expressions:
            for select_expr in select_expressions:
                query = query.select(select_expr, copy=False)

        # Add FROM clause
        if from_table:
            query = query.from_(from_table, copy=False)

        # Add JOINs
        if joins:
            for join in joins:
                query = query.join(
                    join.this, on=join.args.get("on"), join_type=join.args.get("kind"), copy=False
                )

        # Add WHERE clause
        if where_clause:
            query = query.where(where_clause, copy=False)

        # Add GROUP BY clause
        if group_by_expressions:
            for group_expr in group_by_expressions:
                query = query.group_by(group_expr, copy=False)

        # Add HAVING clause
        if having_clause:
            query = query.having(having_clause, copy=False)

        # Add QUALIFY clause
        if qualify_clause:
            query.set("qualify", qualify_clause)

        # Add ORDER BY clause
        if order_by_expressions:
            for order_expr in order_by_expressions:
                query = query.order_by(order_expr, copy=False)

        # Final qualification with default database and schema
        try:
            query = qualify.qualify(
                query,
                catalog=self.default_database,
                db=self.default_schema,
                dialect=target_dialect,
            )
        except Exception:
            # If qualification fails, continue with unqualified query
            pass

        # Generate formatted SQL string
        formatted_sql = query.sql(dialect=target_dialect, pretty=True)

        return formatted_sql

    def _build_ctes(self):
        """
        Loop through self.models insight building the CTE SQLglot expressions. Dynamic vs. non dynamic insights will
        function differently:

        1. **Dyanmic Insights**: The select within each cte runs a "select * from f'{model.name.name_hash()}.parquet'"
        2. **Non-Dynamic Insights**: The select within each cte will pass through the model.sql directly.

        In both cases we could use the SchemaAggregator to fully express the columns within each cte. Also the cte
        will always be aliased with the model.name_hash() value. This is the value that the fields are expecting.
        """
        ctes = []
        native_dialect = get_sqlglot_dialect(self.field_resolver.native_dialect)

        for model in self.models:
            model_hash = model.name_hash()

            # Load schema for this model to expand SELECT *
            schema_data = SchemaAggregator.load_source_schema(
                source_name=model.name, output_dir=self.output_dir
            )

            if self.is_dyanmic:
                # Dynamic insights: SELECT * FROM 'model_hash.parquet'
                cte_sql = f"SELECT * FROM '{model_hash}.parquet'"
                dialect_for_parse = "duckdb"  # Parse as DuckDB for dynamic
            else:
                # Non-dynamic insights: Use model.sql directly
                cte_sql = model.sql
                dialect_for_parse = native_dialect

            # Parse the CTE SQL
            cte_query = sqlglot.parse_one(cte_sql, read=dialect_for_parse)

            # If we have schema data, use it to expand SELECT * and qualify columns
            if schema_data and isinstance(cte_query, exp.Select):
                # Build schema dict for SQLGlot
                model_schema = {}
                tables_data = schema_data.get("tables", {})

                for table_name, table_info in tables_data.items():
                    columns = {}
                    for col_name, col_info in table_info.get("columns", {}).items():
                        # Get the type string
                        col_type = col_info.get("type", "VARCHAR")
                        columns[col_name] = col_type
                    model_schema[table_name] = columns

                # Qualify the query with schema, default database, and default schema
                try:
                    qualified_query = qualify.qualify(
                        cte_query,
                        schema=model_schema,
                        catalog=self.default_database,
                        db=self.default_schema,
                        dialect=dialect_for_parse,
                    )
                    cte_query = qualified_query
                except Exception:
                    # If qualification fails, use the original query
                    pass

            # Create the CTE with the model_hash as the alias
            cte = exp.CTE(
                this=cte_query, alias=exp.TableAlias(this=exp.Identifier(this=model_hash))
            )
            ctes.append(cte)

        return ctes

    def _build_main_select(self):
        """
        Create the final select after the CTEs. Loop through resolved_query_statements filtering for props, split
        and filter statements striped of "ASC, DESC".
        """
        select_expressions = []
        native_dialect = get_sqlglot_dialect(self.field_resolver.native_dialect)
        target_dialect = "duckdb" if self.is_dyanmic else native_dialect

        for key, statement in self.resolved_query_statements:
            # Include props and split statements in SELECT
            if key.startswith("props.") or key == "split":
                # Strip ASC/DESC from the statement
                cleaned_statement = strip_sort_order(statement, native_dialect)

                # Parse the cleaned statement
                parsed_expr = parse_expression(cleaned_statement, native_dialect)

                if parsed_expr:
                    # Generate alias for the expression
                    # alias = field_alias_hasher(cleaned_statement)

                    # # Create an aliased expression
                    # aliased_expr = exp.alias_(parsed_expr, alias, quoted=True)

                    # Transpile to target dialect if needed
                    aliased_expr = parsed_expr
                    if self.is_dyanmic and target_dialect != native_dialect:
                        transpiled = aliased_expr.sql(dialect=target_dialect)
                        aliased_expr = parse_expression(transpiled, target_dialect)

                    select_expressions.append(aliased_expr)

        return select_expressions

    def _build_from_and_joins(self):
        """
        Use RelationGraph to determine join path between all of the dependent models. RelationGraph should determine
        which model is used in the from clause and order of the joins between models. We will need to update
        @visivo/query/relaion_graph.py and create a method that is able to do this. The current ones only work with
        two models, but the foundation is there.

        """
        if not self.models:
            return None, []

        # Get model hashes (these are used as CTE aliases)
        model_hashes = [model.name_hash() for model in self.models]

        # If only one model, just return FROM with that model
        if len(model_hashes) == 1:
            from_table = exp.Table(this=exp.Identifier(this=model_hashes[0]))
            return from_table, []

        # Get the join plan from RelationGraph
        join_plan = self.relation_graph.get_join_plan(model_hashes)
        from_model = join_plan["from_model"]
        joins = join_plan["joins"]

        # Build FROM clause
        from_table = exp.Table(this=exp.Identifier(this=from_model))

        # Build JOIN clauses
        join_nodes = []
        native_dialect = get_sqlglot_dialect(self.field_resolver.native_dialect)
        target_dialect = "duckdb" if self.is_dyanmic else native_dialect

        for _left_model, right_model, condition, join_type in joins:
            # Parse the join condition
            join_condition = parse_expression(condition, native_dialect)

            # Transpile if dynamic
            if self.is_dyanmic and target_dialect != native_dialect:
                transpiled = join_condition.sql(dialect=target_dialect)
                join_condition = parse_expression(transpiled, target_dialect)

            # Create the join node
            join_node = exp.Join(
                this=exp.Table(this=exp.Identifier(this=right_model)),
                on=join_condition,
                kind=join_type.upper() if join_type else "INNER",
            )
            join_nodes.append(join_node)

        return from_table, join_nodes

    def _build_where_clause(self):
        """
        Find filter statements that have non-aggregates in the resolved sql via sqlglot utils function
        has_aggregate_function() and add those statments to this clause.
        """
        where_conditions = []
        native_dialect = get_sqlglot_dialect(self.field_resolver.native_dialect)
        target_dialect = "duckdb" if self.is_dyanmic else native_dialect

        for key, statement in self.resolved_query_statements:
            # Only process filter statements
            if key == "filter":
                # Parse the filter statement
                parsed_expr = parse_expression(statement, native_dialect)

                if parsed_expr:
                    # Only include in WHERE if it has no aggregates and no window functions
                    if not has_aggregate_function(parsed_expr) and not has_window_function(
                        parsed_expr
                    ):
                        # Transpile if dynamic
                        if self.is_dyanmic and target_dialect != native_dialect:
                            transpiled = parsed_expr.sql(dialect=target_dialect)
                            parsed_expr = parse_expression(transpiled, target_dialect)

                        where_conditions.append(parsed_expr)

        # Combine all conditions with AND
        if not where_conditions:
            return None

        if len(where_conditions) == 1:
            return where_conditions[0]

        # Combine multiple conditions with AND
        combined = where_conditions[0]
        for condition in where_conditions[1:]:
            combined = exp.And(this=combined, expression=condition)

        return combined

    def _build_group_by(self):
        """
        Leverage the sqlglot_utils function find_non_aggregated_expressions() to pull out top level
        non aggregate expressions into the group by statement. The function does all of the hard work.
        It will pull out a list of expressions that need to be added to the groupby.
        """
        group_by_expressions = []
        native_dialect = get_sqlglot_dialect(self.field_resolver.native_dialect)
        target_dialect = "duckdb" if self.is_dyanmic else native_dialect

        # Get the SELECT expressions to analyze
        select_expressions = self._build_main_select()

        for select_expr in select_expressions:
            # Find non-aggregated expressions in each SELECT expression
            non_agg_exprs = find_non_aggregated_expressions(select_expr)

            for expr_str in non_agg_exprs:
                # Parse the expression
                parsed_expr = parse_expression(expr_str, native_dialect)

                if parsed_expr:
                    # Transpile if dynamic
                    if self.is_dyanmic and target_dialect != native_dialect:
                        transpiled = parsed_expr.sql(dialect=target_dialect)
                        parsed_expr = parse_expression(transpiled, target_dialect)

                    # Add to group by list if not already present
                    expr_sql = parsed_expr.sql()
                    if not any(e.sql() == expr_sql for e in group_by_expressions):
                        group_by_expressions.append(parsed_expr)

        # Return None if no grouping needed
        if not group_by_expressions:
            return None

        return group_by_expressions

    def _build_having(self):
        """
        Find filter statements that have aggregates in the resolved
        sql via sqlglot utils function using has_aggregate_function() and add
        those entire statments to this clause.
        """
        having_conditions = []
        native_dialect = get_sqlglot_dialect(self.field_resolver.native_dialect)
        target_dialect = "duckdb" if self.is_dyanmic else native_dialect

        for key, statement in self.resolved_query_statements:
            # Only process filter statements
            if key == "filter":
                # Parse the filter statement
                parsed_expr = parse_expression(statement, native_dialect)

                if parsed_expr:
                    # Only include in HAVING if it has aggregates
                    if has_aggregate_function(parsed_expr):
                        # Transpile if dynamic
                        if self.is_dyanmic and target_dialect != native_dialect:
                            transpiled = parsed_expr.sql(dialect=target_dialect)
                            parsed_expr = parse_expression(transpiled, target_dialect)

                        having_conditions.append(parsed_expr)

        # Combine all conditions with AND
        if not having_conditions:
            return None

        if len(having_conditions) == 1:
            return having_conditions[0]

        # Combine multiple conditions with AND
        combined = having_conditions[0]
        for condition in having_conditions[1:]:
            combined = exp.And(this=combined, expression=condition)

        return combined

    def _build_qualify(self):
        """
        Works for REDSHIFT SNOWFLAKE, BIGQUERY & DUCKDB NATIVE DIALECT ONLY in V1. We should use
        sqlglot to determine if the native dialect supports qualify. I think addeding a new function in
        sqlglot_utils.py would make sense for this purpose.

        Find filter statements that have have windows in the resolved sql via sqlglot utils
        has_window_function() and add those statments to this clause.
        """
        native_dialect = get_sqlglot_dialect(self.field_resolver.native_dialect)
        target_dialect = "duckdb" if self.is_dyanmic else native_dialect

        # Check if the target dialect supports QUALIFY
        if not supports_qualify(target_dialect):
            # If QUALIFY is not supported, window filters will need to be handled differently
            # For now, return None (could be implemented as a subquery later)
            return None

        qualify_conditions = []

        for key, statement in self.resolved_query_statements:
            # Only process filter statements
            if key == "filter":
                # Parse the filter statement
                parsed_expr = parse_expression(statement, native_dialect)

                if parsed_expr:
                    # Only include in QUALIFY if it has window functions
                    if has_window_function(parsed_expr):
                        # Transpile if dynamic
                        if self.is_dyanmic and target_dialect != native_dialect:
                            transpiled = parsed_expr.sql(dialect=target_dialect)
                            parsed_expr = parse_expression(transpiled, target_dialect)

                        qualify_conditions.append(parsed_expr)

        # Combine all conditions with AND
        if not qualify_conditions:
            return None

        if len(qualify_conditions) == 1:
            return qualify_conditions[0]

        # Combine multiple conditions with AND
        combined = qualify_conditions[0]
        for condition in qualify_conditions[1:]:
            combined = exp.And(this=combined, expression=condition)

        return combined

    def _build_order_by(self):
        """
        Find order_by statements that have aggregates in the resolved sql via
        functions and add those statments to this clause.
        """
        order_by_expressions = []
        native_dialect = get_sqlglot_dialect(self.field_resolver.native_dialect)
        target_dialect = "duckdb" if self.is_dyanmic else native_dialect

        for key, statement in self.resolved_query_statements:
            # Only process sort statements
            if key == "sort":
                # Parse the sort statement (preserving ASC/DESC)
                parsed_expr = parse_expression(statement, native_dialect)

                if parsed_expr:
                    # Transpile if dynamic
                    if self.is_dyanmic and target_dialect != native_dialect:
                        transpiled = parsed_expr.sql(dialect=target_dialect)
                        parsed_expr = parse_expression(transpiled, target_dialect)

                    order_by_expressions.append(parsed_expr)

        # Return None if no ordering needed
        if not order_by_expressions:
            return None

        return order_by_expressions

    def build(self):

        if not self.is_resolved:
            raise Exception("Need to resolve before running build")

        pre_query = self.pre_query
        post_query = self.post_query
        props_mapping = self.props_mapping

        data = {
            "pre_query": pre_query,
            "post_query": post_query,
            "props_mapping": props_mapping,
        }

        insight_query_info = InsightQueryInfo(**data)
        self.logger.debug(f"InsightQueryInfo built successfully for insight: {self.insight_hash}")
        self.logger.debug(f"Post query: {post_query}")
        self.logger.debug(f"Pre query: {pre_query}")
        self.logger.debug(f"props_mapping: {props_mapping}")
        self.logger.debug(f"Resolved Statements: {self.resolved_query_statements}")

        return insight_query_info
