"""
MultiModelQueryBuilder generates SQL queries that span multiple models.

This module provides functionality to:
1. Build FROM clauses with multiple models
2. Generate appropriate JOIN clauses based on relations
3. Handle GROUP BY with fields from different models
4. Manage field references across models
"""

from typing import Dict, List, Optional, Set, Tuple
from visivo.models.tokenized_trace import TokenizedTrace
from visivo.models.models.model import Model
from visivo.models.project import Project
from visivo.query.relation_graph import RelationGraph, NoJoinPathError
from visivo.logger.logger import Logger
import sqlglot
import sqlglot.expressions as exp


class MultiModelQueryBuilder:
    """
    Builds SQL queries that join multiple models based on their relationships.

    This class takes a tokenized trace that references multiple models and
    generates the appropriate SQL with JOINs.
    """

    def __init__(self, project: Project):
        """
        Initialize the MultiModelQueryBuilder with a project.

        Args:
            project: The project containing models and relations
        """
        self.project = project
        self.relation_graph = RelationGraph(project)

    def build_multi_model_query(
        self, tokenized_trace: TokenizedTrace, primary_model: Model, referenced_models: List[str]
    ) -> str:
        """
        Build a SQL query that joins multiple models.

        Args:
            tokenized_trace: The tokenized trace with field references
            primary_model: The main model for the query
            referenced_models: List of other model names referenced in the trace

        Returns:
            SQL query string with appropriate JOINs
        """
        if not referenced_models:
            # No cross-model references, return original SQL
            return tokenized_trace.sql

        try:
            # Parse the original SQL
            parsed = sqlglot.parse_one(tokenized_trace.sql)

            # Get all models involved (primary + referenced)
            all_models = [primary_model.name] + referenced_models

            # Find the join path connecting all models
            join_path = self.relation_graph.find_join_path(all_models)

            if not join_path:
                Logger.instance().warning(
                    f"No join path found for models: {', '.join(all_models)}. "
                    f"Returning original query."
                )
                return tokenized_trace.sql

            # Modify the SQL to add JOINs
            modified_sql = self._add_joins_to_query(parsed, primary_model, join_path)

            # Handle GROUP BY if needed
            modified_sql = self._handle_group_by(modified_sql, all_models)

            return modified_sql.sql()

        except Exception as e:
            Logger.instance().error(f"Error building multi-model query: {e}")
            # Fall back to original SQL
            return tokenized_trace.sql

    def _add_joins_to_query(
        self,
        parsed_sql: exp.Expression,
        primary_model: Model,
        join_path: List[Tuple[str, str, str]],
    ) -> exp.Expression:
        """
        Add JOIN clauses to the parsed SQL.

        Args:
            parsed_sql: Parsed SQL expression
            primary_model: The primary model
            join_path: List of (from_model, to_model, condition) tuples

        Returns:
            Modified SQL expression with JOINs
        """
        # Find the FROM clause
        from_clause = parsed_sql.find(exp.From)
        if not from_clause:
            # Create a FROM clause if it doesn't exist
            from_clause = exp.From(this=exp.Table(this=primary_model.name))
            parsed_sql.set("from", from_clause)

        # Add each JOIN from the path
        for from_model, to_model, condition in join_path:
            # Determine which model to join (not the primary)
            join_model = to_model if from_model == primary_model.name else from_model

            # Parse the join condition as a regular expression
            join_condition = sqlglot.parse_one(condition)

            # Create JOIN expression
            join_expr = exp.Join(
                this=exp.Table(this=join_model),
                on=join_condition,
                kind="INNER",  # Default to INNER JOIN
            )

            # Add to the query
            if not parsed_sql.args.get("joins"):
                parsed_sql.set("joins", [])
            parsed_sql.args["joins"].append(join_expr)

        return parsed_sql

    def _handle_group_by(self, parsed_sql: exp.Expression, all_models: List[str]) -> exp.Expression:
        """
        Handle GROUP BY clauses when multiple models are involved.

        When aggregating across multiple models, we may need to add
        non-aggregated fields to the GROUP BY clause.

        Args:
            parsed_sql: Parsed SQL expression
            all_models: List of all model names in the query

        Returns:
            Modified SQL expression with updated GROUP BY
        """
        # Check if there are aggregate functions
        has_aggregates = bool(list(parsed_sql.find_all(exp.AggFunc)))

        if not has_aggregates:
            return parsed_sql

        # Get all non-aggregate column references
        non_aggregate_columns = []

        for column in parsed_sql.find_all(exp.Column):
            # Check if this column is inside an aggregate function
            parent = column.parent
            is_in_aggregate = False

            while parent:
                if isinstance(parent, exp.AggFunc):
                    is_in_aggregate = True
                    break
                parent = parent.parent

            if not is_in_aggregate:
                non_aggregate_columns.append(column)

        # If we have non-aggregate columns, ensure they're in GROUP BY
        if non_aggregate_columns:
            group_by = parsed_sql.find(exp.Group)

            if not group_by:
                # Create GROUP BY clause
                group_by = exp.Group(expressions=[col.copy() for col in non_aggregate_columns])
                parsed_sql.set("group", group_by)
            else:
                # Add missing columns to existing GROUP BY
                existing_group_cols = set(str(col) for col in group_by.expressions)

                for col in non_aggregate_columns:
                    col_str = str(col)
                    if col_str not in existing_group_cols:
                        group_by.expressions.append(col.copy())
                        existing_group_cols.add(col_str)

        return parsed_sql

    def validate_cross_model_references(
        self, tokenized_trace: TokenizedTrace, primary_model: Model, referenced_models: List[str]
    ) -> List[str]:
        """
        Validate that all cross-model references can be resolved.

        Args:
            tokenized_trace: The tokenized trace
            primary_model: The primary model
            referenced_models: List of referenced model names

        Returns:
            List of validation warnings/errors
        """
        warnings = []

        # Check if all referenced models exist
        from visivo.models.dag import all_descendants_of_type

        all_models = all_descendants_of_type(type=Model, dag=self.project.dag())
        model_names = {m.name for m in all_models}

        for ref_model in referenced_models:
            if ref_model not in model_names:
                warnings.append(f"Referenced model '{ref_model}' not found in project")

        # Check if models can be joined
        all_model_names = [primary_model.name] + referenced_models

        try:
            join_path = self.relation_graph.find_join_path(all_model_names)
            if not join_path:
                warnings.append(f"No join path found between models: {', '.join(all_model_names)}")
        except NoJoinPathError as e:
            warnings.append(str(e))

        return warnings

    def get_required_fields(self, tokenized_trace: TokenizedTrace, model_name: str) -> Set[str]:
        """
        Get all fields required from a specific model in the trace.

        Args:
            tokenized_trace: The tokenized trace
            model_name: Name of the model

        Returns:
            Set of field names required from the model
        """
        required_fields = set()

        # Parse select items to find model.field references
        for key, value in tokenized_trace.select_items.items():
            if isinstance(value, str):
                # Look for model.field patterns
                parsed = sqlglot.parse_one(value)

                for column in parsed.find_all(exp.Column):
                    if column.table and str(column.table) == model_name:
                        required_fields.add(str(column.this))

        return required_fields

    def optimize_join_order(
        self, models: List[str], statistics: Optional[Dict[str, int]] = None
    ) -> List[str]:
        """
        Optimize the join order based on table statistics.

        Args:
            models: List of model names to join
            statistics: Optional dict of model_name -> estimated_row_count

        Returns:
            Optimized list of models in join order
        """
        if not statistics:
            # No statistics, return original order
            return models

        # Sort models by row count (smallest first for better join performance)
        sorted_models = sorted(models, key=lambda m: statistics.get(m, float("inf")))

        return sorted_models
