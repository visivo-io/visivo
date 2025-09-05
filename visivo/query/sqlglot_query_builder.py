"""
SqlglotQueryBuilder - Build queries using SQLGlot AST construction instead of templates.

This module provides a SQLGlot-based query builder that replaces the template-based
QueryStringFactory. It constructs queries entirely using SQLGlot's AST manipulation,
providing better dialect handling and type safety.
"""

from sqlglot import exp
import sqlglot
from typing import Optional, List, Tuple, Dict
from visivo.models.tokenized_trace import TokenizedTrace
from visivo.models.project import Project
from visivo.models.base.project_dag import ProjectDag
from visivo.query.relation_graph import RelationGraph, NoJoinPathError, AmbiguousJoinError
from visivo.logger.logger import Logger
from visivo.query.sqlglot_utils import (
    get_sqlglot_dialect,
    has_aggregate_function,
    has_window_function,
    find_non_aggregated_columns,
    parse_expression,
)
from visivo.query.model_name_utils import ModelNameSanitizer


class SqlglotQueryBuilder:
    """
    Build queries using SQLGlot AST construction instead of Jinja templates.

    This builder leverages the ProjectDag for understanding dependencies and
    constructs queries entirely with SQLGlot's expression builder, avoiding
    string templates and providing proper dialect-specific SQL generation.
    """

    def __init__(self, tokenized_trace: TokenizedTrace, project: Project):
        """
        Initialize the query builder.

        Args:
            tokenized_trace: The tokenized trace with resolved expressions
            project: The project containing models, metrics, and relations
        """
        self.tokenized_trace = tokenized_trace
        self.project = project
        self.dag: ProjectDag = project.dag()
        self.dialect = get_sqlglot_dialect(tokenized_trace.source_type)
        self.relation_graph = RelationGraph(project) if project.relations else None
        self.model_sanitizer = ModelNameSanitizer()  # Create instance for this query

    def build(self) -> str:
        """
        Build the complete query using SQLGlot expressions.

        Returns:
            The generated SQL query as a string
        """
        # Check if this is a multi-model query
        if self._is_multi_model_query():
            sql = self._build_multi_model_query()
        else:
            sql = self._build_single_model_query()

        # Parse the generated SQL back to apply qualify
        query = sqlglot.parse_one(sql, read=self.dialect)

        # Build schema from dimensions
        schema = self._build_schema_from_dimensions()

        # Apply qualify to properly quote identifiers and resolve columns
        # Only apply if we have schema and it's not causing issues
        if schema:
            try:
                query = sqlglot.optimizer.qualify.qualify(
                    query,
                    schema=schema,
                    quote_identifiers=True,  # Ensure all identifiers are quoted
                    identify=True,  # Quote all identifiers, not just necessary ones
                    dialect=self.dialect,
                )
            except Exception as e:
                # If qualify fails, just use the query as-is
                # This can happen with already-quoted identifiers
                Logger.instance().debug(f"SQLGlot qualify failed, using unqualified query: {e}")
                pass

        # Generate final SQL
        return query.sql(dialect=self.dialect, pretty=True)

    def _is_multi_model_query(self) -> bool:
        """
        Determine if this query involves multiple models.

        Returns:
            True if the query references multiple models
        """
        # Check if tokenized_trace has referenced_models attribute
        if hasattr(self.tokenized_trace, "referenced_models"):
            referenced_models = self.tokenized_trace.referenced_models
            return referenced_models is not None and len(referenced_models) > 0
        return False

    def _build_single_model_query(self) -> str:
        """
        Build a query for a single model.

        Returns:
            The generated SQL query
        """
        # Start with the base model SQL as a CTE
        base_cte = self._build_base_cte()

        # Build the main SELECT statement
        select_expr = self._build_select_expression()

        # Add WHERE clause if filters exist
        if self.tokenized_trace.filter_by:
            select_expr = self._add_where_clause(select_expr)

        # Add GROUP BY if needed
        if self._needs_group_by():
            select_expr = self._add_group_by(select_expr)

        # Add HAVING clause for aggregate filters (must come after GROUP BY)
        select_expr = self._add_having_clause(select_expr)

        # Add ORDER BY if specified
        if self.tokenized_trace.order_by:
            select_expr = self._add_order_by(select_expr)

        # Add LIMIT if specified
        if hasattr(self.tokenized_trace, "limit") and self.tokenized_trace.limit:
            select_expr = self._add_limit(select_expr)

        # Combine CTE and main query
        if base_cte:
            # Add the CTE to the select expression using with_
            query = select_expr.with_(base_cte.alias, as_=base_cte.this)
        else:
            query = select_expr

        # Generate SQL for the specific dialect
        return query.sql(dialect=self.dialect, pretty=True)

    def _build_multi_model_query(self) -> str:
        """
        Build a query involving multiple models with JOINs.

        Returns:
            The generated SQL query with JOINs
        """
        Logger.instance().debug(
            f"Building multi-model query with models: {self.tokenized_trace.referenced_models}"
        )

        # Get all models involved
        base_model = self._get_base_model_name()
        referenced_models = self.tokenized_trace.referenced_models or []

        # Ensure base model is included and unique
        all_models = [base_model] + [m for m in referenced_models if m != base_model]

        if len(all_models) == 1:
            # Only one model, use single model query
            return self._build_single_model_query()

        # Build CTEs for each model
        ctes = self._build_model_ctes(all_models)

        # Find join paths between models
        try:
            join_paths = self._find_join_paths(all_models)
        except (NoJoinPathError, AmbiguousJoinError) as e:
            Logger.instance().error(f"Cannot join models: {e}")
            raise ValueError(f"Cannot join models for multi-model query: {e}")

        # Build main SELECT with JOINs
        select_expr = self._build_joined_select(all_models, join_paths)

        # Add WHERE clause if filters exist
        if self.tokenized_trace.filter_by:
            select_expr = self._add_where_clause_qualified(select_expr, all_models)

        # Add GROUP BY if needed
        if self._needs_group_by():
            select_expr = self._add_group_by_qualified(select_expr, all_models)

        # Add HAVING clause for aggregate filters
        select_expr = self._add_having_clause_qualified(select_expr, all_models)

        # Add ORDER BY if specified
        if self.tokenized_trace.order_by:
            select_expr = self._add_order_by_qualified(select_expr, all_models)

        # Add LIMIT if specified
        if hasattr(self.tokenized_trace, "limit") and self.tokenized_trace.limit:
            select_expr = self._add_limit(select_expr)

        # Combine CTEs and main query
        if ctes:
            # Add all CTEs to the select expression
            for cte in ctes:
                select_expr = select_expr.with_(cte.alias, as_=cte.this)

        # Generate SQL for the specific dialect
        return select_expr.sql(dialect=self.dialect, pretty=True)

    def _build_base_cte(self) -> Optional[exp.CTE]:
        """
        Build the base CTE from the model's SQL.

        Returns:
            A CTE expression or None if not needed
        """
        # Get the model SQL from tokenized_trace.sql
        if not self.tokenized_trace.sql:
            return None

        model_sql = self.tokenized_trace.sql

        # Parse the model SQL using utility function
        parsed_sql = parse_expression(model_sql, dialect=self.dialect)
        if not parsed_sql:
            # If parsing fails, log warning and return None
            Logger.instance().debug(f"Failed to parse model SQL: {model_sql[:100]}...")
            return None

        Logger.instance().debug(
            f"Parsed SQL type: {type(parsed_sql)}, SQL: {parsed_sql.sql(dialect=self.dialect) if parsed_sql else 'None'}"
        )

        # Extract model name from SQL or use default
        # For now, use a default name - in future this should come from the DAG
        model_name = "base_model"
        cte = exp.CTE(alias=exp.Identifier(this=model_name), this=parsed_sql)

        return cte

    def _build_select_expression(self) -> exp.Select:
        """
        Build the main SELECT expression.

        Returns:
            A SELECT expression with all columns
        """
        select = exp.Select()

        # Add SELECT items from tokenized_trace
        if self.tokenized_trace.select_items:
            for alias, expression in self.tokenized_trace.select_items.items():
                # Parse the expression using utility function
                parsed_expr = parse_expression(expression, dialect=self.dialect)
                if not parsed_expr:
                    # If parsing fails, try to create a simple column reference
                    import os

                    if os.environ.get("DEBUG") == "true":
                        Logger.instance().debug(
                            f"Failed to parse expression for {alias}, treating as column reference: {expression}"
                        )
                    parsed_expr = exp.Column(this=expression)

                # Sanitize the alias (replace dots with pipes)
                sanitized_alias = self._sanitize_alias(alias)

                # Add to SELECT with sanitized alias - use quoted identifier
                select = select.select(
                    exp.Alias(
                        this=parsed_expr, alias=exp.Identifier(this=sanitized_alias, quoted=True)
                    )
                )
        else:
            # If no select items, select all columns
            select = select.select(exp.Star())

        # Always add cohort_on column
        if hasattr(self.tokenized_trace, "cohort_on") and self.tokenized_trace.cohort_on:
            cohort_on_expr = parse_expression(self.tokenized_trace.cohort_on, dialect=self.dialect)
            if not cohort_on_expr:
                # If parsing fails, use the raw string
                cohort_on_expr = exp.Literal.string(self.tokenized_trace.cohort_on)

            # Add cohort_on with alias "cohort_on"
            select = select.select(
                exp.Alias(this=cohort_on_expr, alias=exp.Identifier(this="cohort_on", quoted=True))
            )

        # Set FROM clause to reference the CTE
        model_name = getattr(self.tokenized_trace, "model_name", "base_model")
        select = select.from_(model_name)

        return select

    def _needs_group_by(self) -> bool:
        """
        Determine if GROUP BY is needed based on aggregates and non-aggregates.

        Returns:
            True if GROUP BY is required
        """
        # Check if there are both aggregates and non-aggregates
        has_aggregates = False
        has_non_aggregates = False

        # If no select_items, no GROUP BY needed
        if not self.tokenized_trace.select_items:
            return False

        for expression in self.tokenized_trace.select_items.values():
            # Parse the expression using utility function
            parsed = parse_expression(expression, dialect=self.dialect)
            if not parsed:
                continue

            # Skip window functions - they don't require GROUP BY
            if has_window_function(parsed):
                continue

            # Check for aggregates using utility function (excluding window functions)
            if has_aggregate_function(parsed) and not has_window_function(parsed):
                has_aggregates = True

            # Check for non-aggregated columns using utility function
            non_agg_cols = find_non_aggregated_columns(parsed)
            if non_agg_cols:
                has_non_aggregates = True

        return has_aggregates and has_non_aggregates

    def _add_group_by(self, select_expr: exp.Select) -> exp.Select:
        """
        Add GROUP BY clause for non-aggregate columns.

        Args:
            select_expr: The SELECT expression to modify

        Returns:
            The modified SELECT expression with GROUP BY
        """
        group_by_items = []

        # If no select_items, return unchanged
        if not self.tokenized_trace.select_items:
            return select_expr

        # Get non-aggregate columns from select items
        for alias, expression in self.tokenized_trace.select_items.items():
            parsed = parse_expression(expression, dialect=self.dialect)
            if not parsed:
                continue

            # Skip window functions - they don't go in GROUP BY
            if has_window_function(parsed):
                continue

            # Check if this is a non-aggregate expression using utility function
            if not has_aggregate_function(parsed):
                # Use the sanitized quoted alias for GROUP BY to match SELECT
                sanitized_alias = self._sanitize_alias(alias)
                group_by_items.append(exp.Identifier(this=sanitized_alias, quoted=True))

        # Always add cohort_on to GROUP BY if it exists and we have GROUP BY items
        if (
            group_by_items
            and hasattr(self.tokenized_trace, "cohort_on")
            and self.tokenized_trace.cohort_on
        ):
            # Check if cohort_on is not a literal string (which shouldn't be grouped by)
            cohort_on_value = self.tokenized_trace.cohort_on.strip()
            if not (cohort_on_value.startswith("'") and cohort_on_value.endswith("'")):
                # It's a column reference, add to GROUP BY
                group_by_items.append(exp.Identifier(this="cohort_on", quoted=True))
            elif group_by_items:
                # Even for literal cohort_on values, we need to include it in GROUP BY
                # since it's in the SELECT clause
                group_by_items.append(exp.Identifier(this="cohort_on", quoted=True))

        # Add GROUP BY clause if there are items
        if group_by_items:
            select_expr = select_expr.group_by(*group_by_items)

        return select_expr

    def _add_where_clause(self, select_expr: exp.Select) -> exp.Select:
        """
        Add WHERE clause from vanilla filters only.

        Args:
            select_expr: The SELECT expression to modify

        Returns:
            The modified SELECT expression with WHERE clause
        """
        # Only add vanilla filters to WHERE
        conditions = []

        # Handle different filter types
        filter_by = self.tokenized_trace.filter_by
        if isinstance(filter_by, dict):
            # Only get vanilla filters for WHERE clause
            if "vanilla" in filter_by and filter_by["vanilla"]:
                for filter_expr in filter_by["vanilla"]:
                    parsed = parse_expression(filter_expr, dialect=self.dialect)
                    if parsed:
                        conditions.append(parsed)
        elif isinstance(filter_by, list):
            # For list format, we need to check if each filter contains aggregates
            for filter_expr in filter_by:
                parsed = parse_expression(filter_expr, dialect=self.dialect)
                if parsed and not has_aggregate_function(parsed):
                    conditions.append(parsed)

        # Combine conditions with AND
        if conditions:
            where_clause = conditions[0]
            for condition in conditions[1:]:
                where_clause = exp.And(this=where_clause, expression=condition)

            select_expr = select_expr.where(where_clause)

        return select_expr

    def _add_having_clause(self, select_expr: exp.Select) -> exp.Select:
        """
        Add HAVING clause from aggregate filters.

        Args:
            select_expr: The SELECT expression to modify

        Returns:
            The modified SELECT expression with HAVING clause
        """
        # Only add aggregate filters to HAVING
        conditions = []

        # Handle different filter types
        filter_by = self.tokenized_trace.filter_by
        if isinstance(filter_by, dict):
            # Get aggregate filters for HAVING clause
            if "aggregate" in filter_by and filter_by["aggregate"]:
                for filter_expr in filter_by["aggregate"]:
                    parsed = parse_expression(filter_expr, dialect=self.dialect)
                    if parsed:
                        conditions.append(parsed)
        elif isinstance(filter_by, list):
            # For list format, check if each filter contains aggregates
            for filter_expr in filter_by:
                parsed = parse_expression(filter_expr, dialect=self.dialect)
                if parsed and has_aggregate_function(parsed):
                    conditions.append(parsed)

        # Combine conditions with AND
        if conditions:
            having_clause = conditions[0]
            for condition in conditions[1:]:
                having_clause = exp.And(this=having_clause, expression=condition)

            select_expr = select_expr.having(having_clause)

        return select_expr

    def _add_order_by(self, select_expr: exp.Select) -> exp.Select:
        """
        Add ORDER BY clause.

        When GROUP BY is present, we need to check if the ORDER BY column
        is actually an alias in the SELECT clause and use that instead.

        Args:
            select_expr: The SELECT expression to modify

        Returns:
            The modified SELECT expression with ORDER BY
        """
        order_by_items = []

        # Check if GROUP BY is present
        has_group_by = select_expr.find(exp.Group)

        # Build a mapping of expressions to their aliases for lookup
        alias_mapping = {}
        if has_group_by and self.tokenized_trace.select_items:
            for alias, expression in self.tokenized_trace.select_items.items():
                # Store both the original expression and any column references
                alias_mapping[expression] = self._sanitize_alias(alias)
                # Also check for simple column names
                if "(" not in expression and "." not in expression:
                    alias_mapping[expression.lower()] = self._sanitize_alias(alias)

        for order_item in self.tokenized_trace.order_by:
            # Handle DESC/ASC modifiers explicitly
            desc = False
            if order_item.upper().endswith(" DESC"):
                column = order_item[:-5].strip()
                desc = True
            elif order_item.upper().endswith(" ASC"):
                column = order_item[:-4].strip()
                desc = False
            else:
                column = order_item.strip()

            # If GROUP BY is present and this column is an alias, use the alias
            if has_group_by and column.lower() in alias_mapping:
                # Use the alias instead of the column
                order_column = exp.Identifier(this=alias_mapping[column.lower()], quoted=True)
            elif has_group_by and column in alias_mapping:
                # Check exact match too
                order_column = exp.Identifier(this=alias_mapping[column], quoted=True)
            else:
                # Use the column as-is
                order_column = exp.Column(this=column)

            if desc:
                parsed = exp.Ordered(this=order_column, desc=True)
            else:
                parsed = (
                    exp.Ordered(this=order_column, desc=False)
                    if order_item.upper().endswith(" ASC")
                    else order_column
                )

            order_by_items.append(parsed)

        if order_by_items:
            select_expr = select_expr.order_by(*order_by_items)

        return select_expr

    def _add_limit(self, select_expr: exp.Select) -> exp.Select:
        """
        Add LIMIT clause.

        Args:
            select_expr: The SELECT expression to modify

        Returns:
            The modified SELECT expression with LIMIT
        """
        limit_value = getattr(self.tokenized_trace, "limit", None)
        if limit_value:
            select_expr = select_expr.limit(limit_value)

        return select_expr

    def _get_base_model_name(self) -> str:
        """
        Get the name of the base model for the query.

        Returns:
            The base model name
        """
        # The base model is the model directly associated with the trace
        # This is stored in the TokenizedTrace's sql field (from model.sql)
        # We need to extract the model name from the DAG
        from visivo.models.dag import all_descendants_of_type
        from visivo.models.models.model import Model

        if hasattr(self, "_base_model_name_cache"):
            return self._base_model_name_cache

        # Get all models from DAG
        if self.project and self.project.dag():
            dag = self.project.dag()
            models = all_descendants_of_type(type=Model, dag=dag)

            # Find the model whose SQL matches our tokenized trace SQL
            for model in models:
                if hasattr(model, "sql") and model.sql == self.tokenized_trace.sql:
                    self._base_model_name_cache = model.name
                    return model.name

        # Fallback to "base_model" if we can't determine
        return "base_model"

    def _sanitize_model_name(self, model_name: str) -> str:
        """
        Sanitize model name to be SQL-compliant.

        Args:
            model_name: Original model name that may contain spaces or special characters

        Returns:
            SQL-safe identifier
        """
        return self.model_sanitizer.sanitize(model_name)

    def _get_model_alias(self, model_name: str) -> str:
        """
        Get the SQL alias for a model (with caching).

        Args:
            model_name: Original model name

        Returns:
            SQL-safe alias for CTEs and table references
        """
        return self.model_sanitizer.sanitize(model_name)

    def _sanitize_alias(self, alias: str) -> str:
        """
        Sanitize an alias by replacing dots with pipes.

        The frontend expects dots in field names (e.g., props.x), but some SQL dialects
        like BigQuery don't allow dots in aliases. We replace them with pipes here,
        and the Aggregator converts them back to dots.

        Args:
            alias: Original alias that may contain dots

        Returns:
            Sanitized alias with pipes instead of dots
        """
        return alias.replace(".", "|")

    def _build_schema_from_dimensions(self) -> Optional[Dict[str, Dict[str, str]]]:
        """
        Build a schema dictionary from model dimensions for SQLGlot qualify.

        Returns:
            Schema dict like {"table_name": {"column_name": "DATA_TYPE"}}
        """
        if not self.project:
            return None

        schema = {}

        # Get all models from the project
        from visivo.models.dag import all_descendants_of_type
        from visivo.models.models.model import Model

        dag = self.project.dag()
        all_models = all_descendants_of_type(type=Model, dag=dag)

        for model in all_models:
            model_schema = {}

            # Add explicit dimensions
            if hasattr(model, "dimensions") and model.dimensions:
                for dimension in model.dimensions:
                    # Map dimension data types to SQL types
                    sql_type = self._map_dimension_type_to_sql(dimension.data_type)
                    # Strip quotes from dimension name for schema
                    column_name = dimension.name.strip('"').strip("'")
                    model_schema[column_name] = sql_type

            # Add implicit dimensions if they exist
            if hasattr(model, "_implicit_dimensions") and model._implicit_dimensions:
                for dimension in model._implicit_dimensions:
                    sql_type = self._map_dimension_type_to_sql(dimension.data_type)
                    # Strip quotes from dimension name for schema
                    column_name = dimension.name.strip('"').strip("'")
                    model_schema[column_name] = sql_type

            # Add to schema with both original and sanitized model names
            if model_schema:
                # Add with original name
                schema[model.name] = model_schema
                # Also add with sanitized name (for CTEs)
                sanitized_name = self._get_model_alias(model.name)
                schema[f"{sanitized_name}_cte"] = model_schema
                # And base_model for single model queries
                if hasattr(self, "tokenized_trace") and self.tokenized_trace.sql == getattr(
                    model, "sql", None
                ):
                    schema["base_model"] = model_schema

        return schema if schema else None

    def _map_dimension_type_to_sql(self, dimension_type: Optional[str]) -> str:
        """
        Map dimension data types to SQL types for schema.

        Args:
            dimension_type: Dimension data type (e.g., 'string', 'integer', 'date')

        Returns:
            SQL type string
        """
        if not dimension_type:
            return "VARCHAR"

        type_mapping = {
            "string": "VARCHAR",
            "text": "VARCHAR",
            "integer": "INTEGER",
            "int": "INTEGER",
            "bigint": "BIGINT",
            "float": "FLOAT",
            "double": "DOUBLE",
            "decimal": "DECIMAL",
            "numeric": "NUMERIC",
            "date": "DATE",
            "datetime": "TIMESTAMP",
            "timestamp": "TIMESTAMP",
            "boolean": "BOOLEAN",
            "bool": "BOOLEAN",
        }

        return type_mapping.get(dimension_type.lower(), "VARCHAR")

    def _build_model_ctes(self, model_names: List[str]) -> List[exp.CTE]:
        """
        Build CTEs for multiple models.

        Args:
            model_names: List of model names to create CTEs for

        Returns:
            List of CTE expressions
        """
        ctes = []

        if not self.project:
            # If no project, we can only build CTE for base model
            base_cte = self._build_base_cte()
            if base_cte:
                ctes.append(base_cte)
            return ctes

        from visivo.models.dag import all_descendants_of_type
        from visivo.models.models.model import Model

        dag = self.project.dag()
        all_models = all_descendants_of_type(type=Model, dag=dag)
        models_by_name = {model.name: model for model in all_models}

        for model_name in model_names:
            model = models_by_name.get(model_name)
            if model and hasattr(model, "sql") and model.sql:
                # Parse the model SQL
                parsed_sql = parse_expression(model.sql, dialect=self.dialect)
                if parsed_sql:
                    # Create CTE with sanitized name
                    cte_name = f"{self._get_model_alias(model_name)}_cte"
                    cte = exp.CTE(alias=exp.Identifier(this=cte_name), this=parsed_sql)
                    ctes.append(cte)
                else:
                    Logger.instance().debug(f"Failed to parse SQL for model {model_name}")

        return ctes

    def _find_join_paths(self, model_names: List[str]) -> List[Tuple[str, str, str]]:
        """
        Find join paths between models using RelationGraph.

        Args:
            model_names: List of model names to connect

        Returns:
            List of (from_model, to_model, join_condition) tuples

        Raises:
            NoJoinPathError: If models cannot be connected
            AmbiguousJoinError: If multiple equally valid paths exist
        """
        if not self.relation_graph:
            raise NoJoinPathError("No relations defined in project. Cannot join models.")

        return self.relation_graph.find_join_path(model_names)

    def _build_joined_select(
        self, model_names: List[str], join_paths: List[Tuple[str, str, str]]
    ) -> exp.Select:
        """
        Build a SELECT expression with JOINs for multiple models.

        Args:
            model_names: List of model names involved
            join_paths: List of (from_model, to_model, join_condition) tuples

        Returns:
            SELECT expression with JOINs
        """
        # Start with empty SELECT
        select = exp.Select()

        # Determine base model (first in list)
        base_model = model_names[0]
        base_table = f"{self._get_model_alias(base_model)}_cte"

        # Set FROM clause to base model CTE
        select = select.from_(base_table)

        # Track which models have been joined
        joined_models = {base_model}

        # Add JOINs based on join paths
        for from_model, to_model, condition in join_paths:
            # Determine which model to join (the one not yet joined)
            if to_model not in joined_models:
                join_model = to_model
            elif from_model not in joined_models:
                join_model = from_model
            else:
                # Both already joined, skip
                continue

            # Parse and qualify the join condition
            qualified_condition = self._qualify_join_condition(condition, model_names)

            # Add JOIN to select with sanitized table name
            join_table = f"{self._get_model_alias(join_model)}_cte"
            select = select.join(
                join_table,
                on=qualified_condition,
                join_type="INNER",  # TODO: Get from relation
            )

            joined_models.add(join_model)

        # Add SELECT items with qualification
        if self.tokenized_trace.select_items:
            for alias, expression in self.tokenized_trace.select_items.items():
                # Qualify the expression with model names
                qualified_expr = self._qualify_expression(expression, model_names)
                # Sanitize the alias (replace dots with pipes)
                sanitized_alias = self._sanitize_alias(alias)
                select = select.select(
                    exp.Alias(
                        this=qualified_expr, alias=exp.Identifier(this=sanitized_alias, quoted=True)
                    )
                )
        else:
            # Select all columns
            select = select.select(exp.Star())

        # Always add cohort_on column
        if hasattr(self.tokenized_trace, "cohort_on") and self.tokenized_trace.cohort_on:
            cohort_on_expr = parse_expression(self.tokenized_trace.cohort_on, dialect=self.dialect)
            if not cohort_on_expr:
                # If parsing fails, use the raw string
                cohort_on_expr = exp.Literal.string(self.tokenized_trace.cohort_on)

            # Add cohort_on with alias "cohort_on"
            select = select.select(
                exp.Alias(this=cohort_on_expr, alias=exp.Identifier(this="cohort_on", quoted=True))
            )

        return select

    def _qualify_join_condition(self, condition: str, model_names: List[str]) -> exp.Expression:
        """
        Parse and qualify a join condition.

        Args:
            condition: Join condition like "${ref(orders).user_id} = ${ref(users).id}"
            model_names: List of available model names

        Returns:
            Parsed and qualified expression
        """
        import re

        # Replace ${ref(model).field} with sanitized_model_cte.field
        # Handle both quoted and unquoted model names
        pattern = r'\$\{ref\((?:([\'"])([^\'\"]+)\1|([^)]+))\)\.([^}]+)\}'

        def replace_ref(match):
            # Either group 2 (quoted) or group 3 (unquoted) has the model name
            model_name = match.group(2) if match.group(2) else match.group(3)
            model_name = model_name.strip()
            field_name = match.group(4).strip()
            # Use sanitized model name for SQL
            sanitized_model = self._get_model_alias(model_name)
            return f"{sanitized_model}_cte.{field_name}"

        qualified_condition = re.sub(pattern, replace_ref, condition)

        # Parse the qualified condition
        return parse_expression(qualified_condition, dialect=self.dialect)

    def _qualify_expression(self, expression: str, model_names: List[str]) -> exp.Expression:
        """
        Qualify column references in an expression with appropriate model names.

        Args:
            expression: SQL expression that may contain unqualified column references
            model_names: List of available model names

        Returns:
            Qualified expression
        """
        # Parse the expression
        parsed = parse_expression(expression, dialect=self.dialect)
        if not parsed:
            return exp.Column(this=expression)

        # For now, return the parsed expression as-is
        # TODO: Implement proper column qualification logic
        # This would need to determine which model each column belongs to
        return parsed

    def _add_where_clause_qualified(
        self, select_expr: exp.Select, model_names: List[str]
    ) -> exp.Select:
        """
        Add WHERE clause with qualified column references for multi-model queries.

        Args:
            select_expr: The SELECT expression to modify
            model_names: List of model names for qualification

        Returns:
            The modified SELECT expression with WHERE clause
        """
        # For now, use the same logic as single model
        # TODO: Add column qualification
        return self._add_where_clause(select_expr)

    def _add_group_by_qualified(
        self, select_expr: exp.Select, model_names: List[str]
    ) -> exp.Select:
        """
        Add GROUP BY clause with qualified column references for multi-model queries.

        Args:
            select_expr: The SELECT expression to modify
            model_names: List of model names for qualification

        Returns:
            The modified SELECT expression with GROUP BY
        """
        # For now, use the same logic as single model (which includes cohort_on)
        # TODO: Add column qualification
        return self._add_group_by(select_expr)

    def _add_having_clause_qualified(
        self, select_expr: exp.Select, model_names: List[str]
    ) -> exp.Select:
        """
        Add HAVING clause with qualified column references for multi-model queries.

        Args:
            select_expr: The SELECT expression to modify
            model_names: List of model names for qualification

        Returns:
            The modified SELECT expression with HAVING clause
        """
        # For now, use the same logic as single model
        # TODO: Add column qualification
        return self._add_having_clause(select_expr)

    def _add_order_by_qualified(
        self, select_expr: exp.Select, model_names: List[str]
    ) -> exp.Select:
        """
        Add ORDER BY clause with qualified column references for multi-model queries.

        Args:
            select_expr: The SELECT expression to modify
            model_names: List of model names for qualification

        Returns:
            The modified SELECT expression with ORDER BY
        """
        # For now, use the same logic as single model
        # TODO: Add column qualification
        return self._add_order_by(select_expr)
