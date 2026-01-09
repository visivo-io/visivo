from visivo.query.insight.insight_query_info import InsightQueryInfo
from visivo.models.base.project_dag import ProjectDag

from visivo.query.resolvers.field_resolver import FieldResolver
from visivo.query.relation_graph import RelationGraph
from visivo.query.sqlglot_utils import (
    find_non_aggregated_expressions,
    has_window_function,
    has_aggregate_function,
    supports_qualify,
    strip_sort_order,
    parse_expression,
    normalize_identifier_for_dialect,
)
from visivo.query.schema_aggregator import SchemaAggregator
from visivo.query.patterns import (
    INPUT_ACCESSOR_PATTERN,
    extract_input_accessors,
)
from visivo.query.accessor_validator import get_accessor_sample_value
from visivo.logger.logger import Logger
import sqlglot
from sqlglot import exp
from sqlglot.optimizer import qualify
import re
from typing import Tuple, Dict, Optional, List, TYPE_CHECKING

if TYPE_CHECKING:
    from visivo.models.insight import Insight

# Pattern to match ${ref(input_name).accessor} placeholders
# Captures: (1) input_name, (2) accessor
INPUT_PLACEHOLDER_PATTERN = INPUT_ACCESSOR_PATTERN


def get_sample_value_for_input(input_obj, output_dir: str = None, accessor: str = "value") -> str:
    """
    Get a type-appropriate sample value from an input for SQLGlot parsing.

    Priority:
    1. Static options (List[str]): Use options based on accessor type
    2. Default value: Use default
    3. Query-based options with JSON: Load from JSON file

    Args:
        input_obj: The input object (SingleSelectInput or MultiSelectInput)
        output_dir: Output directory for loading JSON files
        accessor: The accessor being used ('value', 'values', 'min', 'max', 'first', 'last')

    Returns:
        A sample value suitable for SQL parsing

    Raises:
        ValueError: If no sample value can be obtained
    """
    from visivo.models.inputs.types.single_select import SingleSelectInput
    from visivo.models.inputs.types.multi_select import MultiSelectInput

    options = None
    default_value = None

    if isinstance(input_obj, SingleSelectInput):
        # Check for static options
        if isinstance(input_obj.options, list) and len(input_obj.options) > 0:
            options = input_obj.options

        # Check for default value
        if input_obj.display and input_obj.display.default:
            default_value = input_obj.display.default.value

    elif isinstance(input_obj, MultiSelectInput):
        # Check for static options (list-based)
        if isinstance(input_obj.options, list) and len(input_obj.options) > 0:
            options = input_obj.options

        # Check for range-based (generate sample range values)
        elif input_obj.range:
            # For range-based, generate sample numeric values
            start = input_obj.range.start if not hasattr(input_obj.range.start, "get_value") else 0
            end = input_obj.range.end if not hasattr(input_obj.range.end, "get_value") else 100
            step = input_obj.range.step if not hasattr(input_obj.range.step, "get_value") else 10

            # Convert to numeric if possible
            try:
                start = float(start) if isinstance(start, (int, float, str)) else 0
                end = float(end) if isinstance(end, (int, float, str)) else 100
                step = float(step) if isinstance(step, (int, float, str)) else 10
                # Generate a few sample values
                options = [start, start + step, end - step, end]
            except (ValueError, TypeError):
                options = [0, 10, 90, 100]  # Fallback

        # Check for default value
        if input_obj.display and input_obj.display.default:
            default = input_obj.display.default
            if default.values is not None and isinstance(default.values, list):
                default_value = default.values
            elif default.start is not None:
                default_value = default.start

    # If we have options, use the accessor sample value function
    if options:
        return get_accessor_sample_value(accessor, options, default_value)

    # Try loading from JSON if available
    if output_dir:
        try:
            from visivo.query.input_validator import get_input_options

            loaded_options = get_input_options(input_obj, output_dir)
            if loaded_options:
                return get_accessor_sample_value(accessor, loaded_options, default_value)
        except (FileNotFoundError, ValueError) as e:
            raise ValueError(
                f"Cannot get sample value for input '{input_obj.name}': "
                f"Query-based input options not yet available. "
                f"Run the input job first or provide static options/default."
            ) from e

    raise ValueError(
        f"Cannot get sample value for input '{input_obj.name}': "
        f"Input must have static options, a default value, or query-based options "
        f"(with JSON file already generated)."
    )


def replace_input_placeholders_for_parsing(
    sql: str,
    dag: "ProjectDag" = None,
    insight: "Insight" = None,
    output_dir: str = None,
) -> Tuple[str, Dict[str, str]]:
    """
    Replace input placeholders with sample values + tracking comments.

    Handles both formats:
    - YAML format: ${ref(input_name).accessor}
    - JS template literal format: ${input_name.accessor}

    SQLGlot misinterprets ${...} syntax (e.g., as STRUCT in DuckDB dialect).
    This function replaces placeholders with type-appropriate sample values from
    the actual input definitions, plus SQL comment markers for restoration.

    Marker format: sample_value /* __VISIVO_INPUT:input_name.accessor__ */

    Args:
        sql: SQL expression potentially containing input placeholders
        dag: Project DAG for looking up input objects
        insight: The insight object (for finding descendant inputs)
        output_dir: Output directory for loading JSON files

    Returns:
        Tuple of (modified_sql, {input_name.accessor: sample_value})

    Raises:
        ValueError: If an input placeholder references an undefined input
    """
    from visivo.models.dag import all_descendants_of_type
    from visivo.models.inputs.input import Input
    from visivo.query.patterns import extract_frontend_input_accessors

    replacements = {}

    # Build mapping of input names to objects from DAG
    input_map = {}
    if dag and insight:
        input_descendants = all_descendants_of_type(type=Input, dag=dag, from_node=insight)
        input_map = {inp.name: inp for inp in input_descendants}

    result_sql = sql

    # Extract (input_name, accessor) tuples from YAML format ${ref(input).accessor}
    accessor_refs = extract_input_accessors(sql)
    for input_name, accessor in accessor_refs:
        if input_name not in input_map:
            raise ValueError(
                f"Input placeholder '${{ref({input_name}).{accessor}}}' references undefined input. "
                f"Make sure input '{input_name}' is defined in your project."
            )

        sample_value = get_sample_value_for_input(
            input_map[input_name], output_dir, accessor=accessor
        )
        key = f"{input_name}.{accessor}"
        replacements[key] = sample_value

        # Replace with: sample_value /* __VISIVO_INPUT:input_name.accessor__ */
        marker = f"{sample_value} /* __VISIVO_INPUT:{input_name}.{accessor}__ */"
        pattern = rf"\$\{{ref\({input_name}\)\.{accessor}\}}"
        result_sql = re.sub(pattern, marker, result_sql)

    # Also handle JS template literal format ${input.accessor}
    frontend_refs = extract_frontend_input_accessors(result_sql)
    for input_name, accessor in frontend_refs:
        if input_name not in input_map:
            # Not an input - skip (might be a model reference or other syntax)
            continue

        sample_value = get_sample_value_for_input(
            input_map[input_name], output_dir, accessor=accessor
        )
        key = f"{input_name}.{accessor}"
        replacements[key] = sample_value

        # Replace with: sample_value /* __VISIVO_INPUT:input_name.accessor__ */
        marker = f"{sample_value} /* __VISIVO_INPUT:{input_name}.{accessor}__ */"
        pattern = rf"\$\{{{input_name}\.{accessor}\}}"
        result_sql = re.sub(pattern, marker, result_sql)

    return result_sql, replacements


def restore_input_placeholders(sql: str) -> str:
    """
    Restore ${input_name.accessor} placeholders from marker comments after SQLGlot processing.

    Finds patterns like: value /* __VISIVO_INPUT:input_name.accessor__ */
    Replaces with: ${input_name.accessor}

    Note: The ref() wrapper is stripped for frontend injection. Frontend uses
    nested object access via JS template literals: ${input_name.accessor}

    Args:
        sql: SQL string with marker comments

    Returns:
        SQL string with ${input_name.accessor} placeholders restored
    """
    # Pattern matches: anything followed by /* __VISIVO_INPUT:name.accessor__ */
    # We need to remove the sample value AND the comment, replace with ${name.accessor}
    # The marker format is: input_name.accessor (e.g., region.value, price_range.min)
    pattern = r"[^\s,\)]+\s*/\*\s*__VISIVO_INPUT:([\w\.]+)__\s*\*/"

    def replace_marker(match):
        # match.group(1) is "input_name.accessor"
        input_accessor = match.group(1)
        return f"${{{input_accessor}}}"

    return re.sub(pattern, replace_marker, sql)


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
        self.insight = insight  # Store for placeholder replacement
        self.dag = dag
        self.output_dir = output_dir
        self.insight_hash = insight.name_hash()
        self.insight_name = insight.name
        self.unresolved_query_statements = insight.get_all_query_statements(dag)
        self.is_dynamic = insight.is_dynamic(dag)
        self.models = insight.get_all_dependent_models(dag)
        source = insight.get_dependent_source(dag, output_dir)
        self.default_schema = source.db_schema
        self.default_database = source.database
        self.native_dialect = source.get_sqlglot_dialect()
        field_resolver = FieldResolver(
            dag=dag, output_dir=output_dir, native_dialect=source.get_sqlglot_dialect()
        )
        self.field_resolver = field_resolver
        # Pass relevant_models to RelationGraph to scope relation resolution
        # This prevents resolving conditions for models that haven't been executed yet
        relevant_model_names = {m.name for m in self.models}
        self.relation_graph = RelationGraph(
            dag, field_resolver, relevant_models=relevant_model_names
        )

        self.main_query = None
        self.resolved_query_statements = None
        self.is_resolved = False

    def _transpile_if_dynamic(
        self, expr: exp.Expression, target_dialect: str
    ) -> Optional[exp.Expression]:
        """Transpile expression to target dialect if this is a dynamic insight."""
        if not expr:
            return expr
        if self.is_dynamic and target_dialect != self.native_dialect:
            transpiled = expr.sql(dialect=target_dialect)
            return parse_expression(transpiled, target_dialect)
        return expr

    def _combine_conditions_with_and(
        self, conditions: List[exp.Expression]
    ) -> Optional[exp.Expression]:
        """Combine a list of conditions with AND, returning None if empty."""
        if not conditions:
            return None
        if len(conditions) == 1:
            return conditions[0]
        combined = conditions[0]
        for condition in conditions[1:]:
            combined = exp.And(this=combined, expression=condition)
        return combined

    @property
    def props_mapping(self):
        if not self.is_resolved:
            raise Exception("Need to resolve before accessing props_mapping")
        props_statements = [
            (key, statement) for key, statement in self.resolved_query_statements if "props." in key
        ]
        props_map = {}
        for key, statement in props_statements:
            # Extract alias after " AS " and strip surrounding quotes
            alias = statement.split(" AS ")[1]
            # Remove surrounding quotes (both single and double)
            alias = alias.strip("'\"")
            props_map[key] = alias
        return props_map

    @property
    def split_key(self):
        """Return the column alias for the split field, if present.

        Used by the frontend to group data by split values and create multiple Plotly traces.
        """
        if not self.is_resolved:
            raise Exception("Need to resolve before accessing split_key")
        for key, statement in self.resolved_query_statements:
            if key == "split":
                # Extract alias after " AS " and strip surrounding quotes
                alias = statement.split(" AS ")[1]
                alias = alias.strip("'\"")
                return alias
        return None

    @property
    def static_props(self):
        """Return static (non-query) props from the insight.

        Used by the frontend to apply static Plotly props like marker.color: ["red", "green"]
        that are not derived from query results.

        Input refs like ${ref(input).accessor} are converted to ${input.accessor} for
        frontend JS template literal injection.
        """
        raw_static_props = self.insight.props.extract_static_props()
        return self._convert_input_refs_in_props(raw_static_props)

    def _convert_input_refs_in_props(self, obj):
        """
        Recursively convert ${ref(input).accessor} to ${input.accessor} in props.

        This converts YAML-format input references to JS template literal format
        for frontend runtime injection.

        Args:
            obj: A dict, list, or primitive value from props

        Returns:
            The same structure with input refs converted
        """
        if isinstance(obj, str):
            return self.insight._convert_input_refs_to_js_templates(obj, self.dag)
        elif isinstance(obj, dict):
            return {k: self._convert_input_refs_in_props(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [self._convert_input_refs_in_props(item) for item in obj]
        else:
            return obj

    @property
    def pre_query(self):
        if not self.is_resolved:
            raise Exception("Need to resolve before accessing pre_query")
        if self.is_dynamic:
            return None
        else:
            return self._build_main_query()

    @property
    def post_query(self):
        if not self.is_resolved:
            raise Exception("Need to resolve before accessing pre_query")
        if self.is_dynamic:
            return self._build_main_query()
        else:
            # Non-dynamic: Query the registered table directly (no .parquet extension)
            # Frontend registers parquet files as tables using insight_hash as table name
            return f'SELECT * FROM "{self.insight_hash}"'

    def resolve(self):
        """Sets the resolved_query_statements"""
        resolved_query_statements = []
        for key, statement in self.unresolved_query_statements:
            if key == "sort":
                # Sort expressions need special handling to preserve ASC/DESC modifiers
                resolved_statement = self.field_resolver.resolve_sort(expression=statement)
            elif key == "filter":
                resolved_statement = self.field_resolver.resolve(expression=statement, alias=False)
            else:
                resolved_statement = self.field_resolver.resolve(expression=statement)
            resolved_query_statements.append((key, resolved_statement))
        self.resolved_query_statements = resolved_query_statements
        self.is_resolved = True

    def _build_main_query(self):
        """
        Build the main query SQL.

        - For DYNAMIC insights: Build SQL string directly to preserve ${input_name} placeholders
        - For STATIC insights: Use SQLGlot AST for validation and formatting

        Dynamic insights skip SQLGlot AST building because SQLGlot misinterprets ${input_name}
        as PostgreSQL syntax. Since dynamic queries run in DuckDB WASM (browser), runtime
        validation is sufficient.
        """
        if self.is_dynamic:
            # Dynamic query: Skip SQLGlot AST to preserve input placeholders
            return self._build_dynamic_query_string_directly()
        else:
            # Static query: Use SQLGlot AST for validation and formatting
            return self._build_static_query_with_sqlglot()

    def _build_dynamic_query_string_directly(self):
        """
        Build SQL query string directly for dynamic insights without using SQLGlot AST.

        This avoids SQLGlot parsing issues with ${input_name} template literals.
        The resolved_query_statements already have field references resolved by FieldResolver,
        so we just need to assemble them into a properly formatted SQL string.

        Dynamic insights always query from registered parquet tables (model hashes).

        Returns:
            Formatted SQL string with ${input_name} placeholders preserved
        """
        # Collect SELECT expressions (props and split)
        select_clauses = []
        for key, statement in self.resolved_query_statements:
            if key.startswith("props.") or key == "split":
                select_clauses.append(statement)

        if not select_clauses:
            raise ValueError("Dynamic insight must have at least one prop for SELECT clause")

        # Collect FROM clause - use model hash as table name
        # Dynamic insights query from registered parquet tables
        if not self.models:
            raise ValueError("Dynamic insight must have at least one model")

        # Get model names and hashes for FROM/JOIN
        model_names = [model.name for model in self.models]
        name_to_hash = {model.name: model.name_hash() for model in self.models}

        # Build FROM clause and JOINs if multiple models
        if len(model_names) == 1:
            from_clause = f'"{name_to_hash[model_names[0]]}"'
            join_clauses = []
        else:
            # Multiple models: use RelationGraph to determine join plan
            join_plan = self.relation_graph.get_join_plan(model_names)
            from_model_hash = name_to_hash[join_plan["from_model"]]
            from_clause = f'"{from_model_hash}"'

            # Build JOIN clauses
            join_clauses = []
            for _left, right, condition, join_type in join_plan["joins"]:
                right_hash = name_to_hash[right]
                join_type_str = join_type.upper() if join_type else "INNER"
                join_clauses.append(f'{join_type_str} JOIN "{right_hash}" ON {condition}')

        # Collect WHERE conditions (non-aggregate, non-window filters)
        where_conditions = []
        for key, statement in self.resolved_query_statements:
            if key == "filter":
                # Replace input placeholders with sample values for SQLGlot parsing
                safe_statement, _ = replace_input_placeholders_for_parsing(
                    statement, dag=self.dag, insight=self.insight, output_dir=self.output_dir
                )
                parsed = parse_expression(safe_statement, "duckdb")
                if (
                    parsed
                    and not has_aggregate_function(parsed)
                    and not has_window_function(parsed)
                ):
                    # Use original statement (with placeholders) in final query
                    where_conditions.append(statement)

        # Collect GROUP BY expressions
        # Use find_non_aggregated_expressions() to get full expressions (e.g., CASE statements)
        # that need to be in GROUP BY, then restore ${input} placeholders
        group_by_clauses = []
        for select_clause in select_clauses:
            # Replace input placeholders with sample values for SQLGlot parsing
            expr_part = select_clause.split(" AS ")[0]
            safe_expr, _ = replace_input_placeholders_for_parsing(
                expr_part, dag=self.dag, insight=self.insight, output_dir=self.output_dir
            )
            parsed = parse_expression(safe_expr, "duckdb")
            if parsed:
                # Use find_non_aggregated_expressions to get full expressions for GROUP BY
                # Pass duckdb dialect for dynamic queries (they run in browser DuckDB WASM)
                non_agg_exprs = find_non_aggregated_expressions(parsed, dialect="duckdb")
                for expr_sql in non_agg_exprs:
                    # Restore ${input} placeholders for JS runtime injection
                    restored_expr = restore_input_placeholders(expr_sql)
                    if restored_expr not in group_by_clauses:
                        group_by_clauses.append(restored_expr)

        # Also collect GROUP BY expressions from ORDER BY clauses
        # Sort expressions may reference non-aggregated columns not in SELECT
        for key, statement in self.resolved_query_statements:
            if key == "sort":
                # Strip ASC/DESC before parsing
                sort_expr = statement.strip()
                if sort_expr.upper().endswith(" DESC"):
                    sort_expr = sort_expr[:-5].strip()
                elif sort_expr.upper().endswith(" ASC"):
                    sort_expr = sort_expr[:-4].strip()

                # Replace input placeholders for SQLGlot parsing
                safe_expr, _ = replace_input_placeholders_for_parsing(
                    sort_expr, dag=self.dag, insight=self.insight, output_dir=self.output_dir
                )
                parsed = parse_expression(safe_expr, "duckdb")
                if parsed:
                    non_agg_exprs = find_non_aggregated_expressions(parsed, dialect="duckdb")
                    for expr_sql in non_agg_exprs:
                        restored_expr = restore_input_placeholders(expr_sql)
                        if restored_expr not in group_by_clauses:
                            group_by_clauses.append(restored_expr)

        # Collect HAVING conditions (aggregate filters)
        having_conditions = []
        for key, statement in self.resolved_query_statements:
            if key == "filter":
                # Replace input placeholders with sample values for SQLGlot parsing
                safe_statement, _ = replace_input_placeholders_for_parsing(
                    statement, dag=self.dag, insight=self.insight, output_dir=self.output_dir
                )
                parsed = parse_expression(safe_statement, "duckdb")
                if parsed and has_aggregate_function(parsed):
                    # Use original statement (with placeholders) in final query
                    having_conditions.append(statement)

        # Collect ORDER BY (sort interactions)
        order_by_clauses = []
        for key, statement in self.resolved_query_statements:
            if key == "sort":
                order_by_clauses.append(statement)

        # Assemble query
        query_parts = ["SELECT"]
        query_parts.append("  " + ",\n  ".join(select_clauses))
        query_parts.append(f"FROM {from_clause}")

        if join_clauses:
            for join_clause in join_clauses:
                query_parts.append(join_clause)

        if where_conditions:
            query_parts.append("WHERE")
            query_parts.append("  " + " AND ".join(where_conditions))

        if group_by_clauses:
            query_parts.append("GROUP BY")
            query_parts.append("  " + ", ".join(group_by_clauses))

        if having_conditions:
            query_parts.append("HAVING")
            query_parts.append("  " + " AND ".join(having_conditions))

        if order_by_clauses:
            query_parts.append("ORDER BY")
            query_parts.append("  " + ", ".join(order_by_clauses))

        return "\n".join(query_parts)

    def _build_static_query_with_sqlglot(self):
        """
        Build query using SQLGlot AST for non-dynamic insights.

        This provides validation and proper dialect transpilation for insights
        without input references.
        """
        # Build all the query components
        ctes = self._build_ctes()
        select_expressions = self._build_main_select()
        from_table, joins = self._build_from_and_joins()
        where_clause = self._build_where_clause()
        group_by_expressions = self._build_group_by()
        having_clause = self._build_having()
        qualify_clause = self._build_qualify()
        order_by_expressions = self._build_order_by()
        target_dialect = self.native_dialect

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

        # Note: We do NOT call qualify.qualify() on the main query here because:
        # 1. Column references are already fully qualified by identify_column_references()
        # 2. CTE aliases are local table aliases that don't need database/schema qualification
        # 3. Calling qualify() causes double-qualification and case mismatches in Snowflake
        #    (Snowflake uppercases unquoted identifiers, but our column refs are lowercase quoted)

        # Generate formatted SQL string
        formatted_sql = query.sql(dialect=target_dialect, pretty=True)

        return formatted_sql

    def _build_ctes(self):
        """
        Loop through self.models insight building the CTE SQLglot expressions. Dynamic vs. non dynamic insights will
        function differently:

        1. **Dynamic Insights**: No CTEs are generated - parquet files are already registered as tables using model_hash
        2. **Non-Dynamic Insights**: The select within each cte will pass through the model.sql directly.

        In both cases we could use the SchemaAggregator to fully express the columns within each cte. Also the cte
        will always be aliased with the model.name_hash() value. This is the value that the fields are expecting.
        """
        ctes = []

        # Dynamic insights don't need CTEs - tables are already registered with model_hash names
        if self.is_dynamic:
            return ctes

        for model in self.models:
            model_hash = model.name_hash()

            # Load schema for this model to expand SELECT *
            schema_data = SchemaAggregator.load_source_schema(
                source_name=model.name, output_dir=self.output_dir
            )

            # Non-dynamic insights: Use model.sql directly
            cte_sql = model.sql
            dialect_for_parse = self.native_dialect

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

            # For Snowflake, uppercase all alias identifiers in the CTE
            # This ensures CTE column aliases like "AS new_x" become "AS NEW_X"
            # which matches Snowflake's unquoted identifier storage (UPPERCASE)
            if dialect_for_parse == "snowflake":
                for alias_node in cte_query.find_all(exp.Alias):
                    if alias_node.alias:
                        alias_node.set(
                            "alias", exp.Identifier(this=alias_node.alias.upper(), quoted=True)
                        )

            # Create the CTE with the model_hash as the alias
            # For Snowflake, uppercase the identifier to match column references
            cte_alias = model_hash.upper() if dialect_for_parse == "snowflake" else model_hash
            cte = exp.CTE(
                this=cte_query,
                alias=exp.TableAlias(this=exp.Identifier(this=cte_alias, quoted=True)),
            )
            ctes.append(cte)

        return ctes

    def _build_main_select(self):
        """
        Create the final select after the CTEs. Loop through resolved_query_statements filtering for props, split
        and filter statements striped of "ASC, DESC".
        """
        select_expressions = []
        target_dialect = "duckdb" if self.is_dynamic else self.native_dialect

        for key, statement in self.resolved_query_statements:
            # Include props and split statements in SELECT
            if key.startswith("props.") or key == "split":
                # Strip ASC/DESC from the statement
                cleaned_statement = strip_sort_order(statement, self.native_dialect)

                # Parse the statement
                parsed_expr = parse_expression(cleaned_statement, self.native_dialect)

                if parsed_expr:
                    aliased_expr = self._transpile_if_dynamic(parsed_expr, target_dialect)
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

        # Get model names for RelationGraph (it uses names, not hashes)
        model_names = [model.name for model in self.models]

        # Create name->hash mapping for SQL generation (SQL uses hashes as table aliases)
        name_to_hash = {model.name: model.name_hash() for model in self.models}

        # Determine target dialect for identifier normalization
        target_dialect = "duckdb" if self.is_dynamic else self.native_dialect

        # If only one model, just return FROM with that model's hash
        # Use normalized identifiers for consistent case handling across dialects
        if len(model_names) == 1:
            model_hash = name_to_hash[model_names[0]]
            from_table = exp.Table(
                this=normalize_identifier_for_dialect(model_hash, target_dialect, quoted=True)
            )
            return from_table, []

        # Get the join plan from RelationGraph (pass names, get names back)
        join_plan = self.relation_graph.get_join_plan(model_names)
        from_model_name = join_plan["from_model"]
        joins = join_plan["joins"]

        # Convert from_model name to hash for SQL
        from_model_hash = name_to_hash[from_model_name]

        # Build FROM clause using normalized identifier for consistent case handling
        from_table = exp.Table(
            this=normalize_identifier_for_dialect(from_model_hash, target_dialect, quoted=True)
        )

        # Build JOIN clauses
        join_nodes = []

        for _left_model_name, right_model_name, condition, join_type in joins:
            # Convert right model name to hash for SQL
            right_model_hash = name_to_hash[right_model_name]

            # Parse the join condition and transpile if dynamic
            join_condition = parse_expression(condition, self.native_dialect)
            join_condition = self._transpile_if_dynamic(join_condition, target_dialect)

            # Create the join node using normalized identifier for consistent case handling
            join_node = exp.Join(
                this=exp.Table(
                    this=normalize_identifier_for_dialect(
                        right_model_hash, target_dialect, quoted=True
                    )
                ),
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
        target_dialect = "duckdb" if self.is_dynamic else self.native_dialect

        for key, statement in self.resolved_query_statements:
            # Only process filter statements
            if key == "filter":
                # Parse the filter statement
                parsed_expr = parse_expression(statement, self.native_dialect)

                if parsed_expr:
                    # Only include in WHERE if it has no aggregates and no window functions
                    if not has_aggregate_function(parsed_expr) and not has_window_function(
                        parsed_expr
                    ):
                        parsed_expr = self._transpile_if_dynamic(parsed_expr, target_dialect)
                        where_conditions.append(parsed_expr)

        return self._combine_conditions_with_and(where_conditions)

    def _build_group_by(self):
        """
        Leverage the sqlglot_utils function find_non_aggregated_expressions() to pull out top level
        non aggregate expressions into the group by statement. The function does all of the hard work.
        It will pull out a list of expressions that need to be added to the groupby.
        """
        group_by_expressions = []
        target_dialect = "duckdb" if self.is_dynamic else self.native_dialect

        # Get the SELECT expressions to analyze
        select_expressions = self._build_main_select()

        for select_expr in select_expressions:
            # Find non-aggregated expressions in each SELECT expression
            # Pass dialect for proper identifier quoting (e.g., backticks for BigQuery)
            non_agg_exprs = find_non_aggregated_expressions(select_expr, dialect=target_dialect)

            for expr_str in non_agg_exprs:
                # Parse the expression
                parsed_expr = parse_expression(expr_str, self.native_dialect)

                if parsed_expr:
                    parsed_expr = self._transpile_if_dynamic(parsed_expr, target_dialect)
                    # Add to group by list if not already present
                    expr_sql = parsed_expr.sql()
                    if not any(e.sql() == expr_sql for e in group_by_expressions):
                        group_by_expressions.append(parsed_expr)

        # Also include non-aggregated expressions from ORDER BY clauses
        # Sort expressions may reference non-aggregated columns not in SELECT
        for key, statement in self.resolved_query_statements:
            if key == "sort":
                # Strip ASC/DESC before parsing
                sort_expr = statement.strip()
                if sort_expr.upper().endswith(" DESC"):
                    sort_expr = sort_expr[:-5].strip()
                elif sort_expr.upper().endswith(" ASC"):
                    sort_expr = sort_expr[:-4].strip()

                parsed_sort = parse_expression(sort_expr, self.native_dialect)
                if parsed_sort:
                    non_agg_exprs = find_non_aggregated_expressions(
                        parsed_sort, dialect=target_dialect
                    )
                    for expr_str in non_agg_exprs:
                        parsed_expr = parse_expression(expr_str, self.native_dialect)
                        if parsed_expr:
                            parsed_expr = self._transpile_if_dynamic(parsed_expr, target_dialect)
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
        target_dialect = "duckdb" if self.is_dynamic else self.native_dialect

        for key, statement in self.resolved_query_statements:
            # Only process filter statements
            if key == "filter":
                # Parse the filter statement
                parsed_expr = parse_expression(statement, self.native_dialect)

                if parsed_expr:
                    # Only include in HAVING if it has aggregates
                    if has_aggregate_function(parsed_expr):
                        parsed_expr = self._transpile_if_dynamic(parsed_expr, target_dialect)
                        having_conditions.append(parsed_expr)

        return self._combine_conditions_with_and(having_conditions)

    def _build_qualify(self):
        """
        Works for REDSHIFT SNOWFLAKE, BIGQUERY & DUCKDB NATIVE DIALECT ONLY in V1. We should use
        sqlglot to determine if the native dialect supports qualify. I think addeding a new function in
        sqlglot_utils.py would make sense for this purpose.

        Find filter statements that have have windows in the resolved sql via sqlglot utils
        has_window_function() and add those statments to this clause.
        """
        target_dialect = "duckdb" if self.is_dynamic else self.native_dialect

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
                parsed_expr = parse_expression(statement, self.native_dialect)

                if parsed_expr:
                    # Only include in QUALIFY if it has window functions
                    if has_window_function(parsed_expr):
                        parsed_expr = self._transpile_if_dynamic(parsed_expr, target_dialect)
                        qualify_conditions.append(parsed_expr)

        return self._combine_conditions_with_and(qualify_conditions)

    def _build_order_by(self):
        """
        Find order_by statements that have aggregates in the resolved sql via
        functions and add those statments to this clause.

        Handles ASC/DESC modifiers by stripping them before parsing (to avoid
        SQLGlot treating them as aliases) and wrapping the result in exp.Ordered.
        """
        order_by_expressions = []
        target_dialect = "duckdb" if self.is_dynamic else self.native_dialect

        for key, statement in self.resolved_query_statements:
            # Only process sort statements
            if key == "sort":
                # Extract ASC/DESC from the end of the statement before parsing
                # SQLGlot treats "column ASC" as Alias(column, "ASC") outside ORDER BY context
                sort_desc = None  # None = no ordering, False = ASC, True = DESC
                statement_stripped = statement.strip()
                upper_statement = statement_stripped.upper()

                if upper_statement.endswith(" DESC"):
                    sort_desc = True
                    statement_stripped = statement_stripped[:-5].strip()
                elif upper_statement.endswith(" ASC"):
                    sort_desc = False
                    statement_stripped = statement_stripped[:-4].strip()

                # Parse the sort statement (without ASC/DESC)
                parsed_expr = parse_expression(statement_stripped, self.native_dialect)

                if parsed_expr:
                    parsed_expr = self._transpile_if_dynamic(parsed_expr, target_dialect)

                    # Wrap in Ordered node if ASC/DESC was specified
                    if sort_desc is not None:
                        parsed_expr = exp.Ordered(this=parsed_expr, desc=sort_desc)

                    order_by_expressions.append(parsed_expr)

        # Return None if no ordering needed
        if not order_by_expressions:
            return None

        return order_by_expressions

    def build(self):
        """
        Build and validate insight queries.

        This method generates pre_query and post_query SQL, then validates them
        using SQLGlot to catch syntax errors at build time rather than runtime.

        Validation ensures that:
        - post_query is valid DuckDB SQL (runs in browser WASM)
        - pre_query is valid in the source dialect (runs on backend)

        Returns:
            InsightQueryInfo: Query information with validated SQL

        Raises:
            SqlValidationError: If generated SQL is syntactically invalid
        """
        if not self.is_resolved:
            raise Exception("Need to resolve before running build")

        pre_query = self.pre_query
        post_query = self.post_query
        props_mapping = self.props_mapping

        # Collect context for error messages
        context = {
            "models": [m.name for m in self.models],
            "props": list(props_mapping.keys()),
            "is_dynamic": self.is_dynamic,
        }

        # Skip validation for dynamic queries since they contain ${input_name} placeholders
        # that will be filled in by the frontend before execution
        if post_query and not self.is_dynamic:
            from visivo.query.sqlglot_utils import validate_query

            self.logger.debug(f"Validating post_query for insight: {self.insight_hash}")

            validate_query(
                query_sql=post_query,
                dialect="duckdb",
                insight_name=self.insight_name,
                query_type="post_query",
                context=context,
                raise_on_error=True,  # Fail build on invalid SQL
            )

            self.logger.debug("✓ Post-query validation passed")

        # VALIDATE PRE-QUERY (runs on source backend)
        if pre_query and not self.is_dynamic:
            from visivo.query.sqlglot_utils import validate_query

            self.logger.debug(f"Validating pre_query for insight: {self.insight_name}")

            validate_query(
                query_sql=pre_query,
                dialect=self.native_dialect,
                insight_name=self.insight_name,
                query_type="pre_query",
                context=context,
                raise_on_error=True,
            )

            self.logger.debug("✓ Pre-query validation passed")

        data = {
            "pre_query": pre_query,
            "post_query": post_query,
            "props_mapping": props_mapping,
            "split_key": self.split_key,
            "static_props": self.static_props,
        }

        insight_query_info = InsightQueryInfo(**data)
        self.logger.debug(f"InsightQueryInfo built successfully for insight: {self.insight_hash}")
        self.logger.debug(f"Post query: {post_query}")
        self.logger.debug(f"Pre query: {pre_query}")
        self.logger.debug(f"props_mapping: {props_mapping}")
        self.logger.debug(f"split_key: {self.split_key}")
        self.logger.debug(f"Resolved Statements: {self.resolved_query_statements}")

        return insight_query_info
