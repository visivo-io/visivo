"""
CTE (Common Table Expression) builder component for SQL queries.

Handles construction of CTEs for single and multiple models.
"""

from typing import List, Dict, Optional
from sqlglot import exp
from visivo.query.sqlglot_utils import parse_expression
from visivo.logger.logger import Logger


class CTEBuilder:
    """Builds CTEs (Common Table Expressions) for SQL queries."""

    def __init__(self, dialect: str, project=None):
        """
        Initialize the CTE builder.

        Args:
            dialect: SQL dialect to use for parsing
            project: Optional Project instance for multi-model support
        """
        self.dialect = dialect
        self.project = project

    def build_base_cte(self, model_sql: str, model_name: str = "base_model") -> Optional[exp.CTE]:
        """
        Build a CTE from model SQL.

        Args:
            model_sql: The SQL query for the model
            model_name: Name to use for the CTE

        Returns:
            A CTE expression or None if parsing fails
        """
        if not model_sql:
            return None

        parsed_sql = parse_expression(model_sql, dialect=self.dialect)
        if not parsed_sql:
            Logger.instance().debug(f"Failed to parse model SQL: {model_sql[:100]}...")
            return None

        Logger.instance().debug(
            f"Parsed SQL type: {type(parsed_sql)}, "
            f"SQL: {parsed_sql.sql(dialect=self.dialect) if parsed_sql else 'None'}"
        )

        cte = exp.CTE(alias=exp.Identifier(this=model_name), this=parsed_sql)
        return cte

    def build_model_ctes(
        self, model_names: List[str], get_model_alias_fn, models_by_name: Optional[Dict] = None
    ) -> List[exp.CTE]:
        """
        Build CTEs for multiple models.

        Args:
            model_names: List of model names to create CTEs for
            get_model_alias_fn: Function to get sanitized alias for model name
            models_by_name: Optional dict of model name to Model object

        Returns:
            List of CTE expressions
        """
        ctes = []

        if not self.project and not models_by_name:
            # No project or models provided, cannot build CTEs
            return ctes

        if not models_by_name and self.project:
            from visivo.models.dag import all_descendants_of_type
            from visivo.models.models.model import Model

            dag = self.project.dag()
            all_models = all_descendants_of_type(type=Model, dag=dag)
            models_by_name = {model.name: model for model in all_models}

        for model_name in model_names:
            model = models_by_name.get(model_name)
            if model and hasattr(model, "sql") and model.sql:
                parsed_sql = parse_expression(model.sql, dialect=self.dialect)
                if parsed_sql:
                    cte_name = f"{get_model_alias_fn(model_name)}_cte"
                    cte = exp.CTE(alias=exp.Identifier(this=cte_name), this=parsed_sql)
                    ctes.append(cte)
                else:
                    Logger.instance().debug(f"Failed to parse SQL for model {model_name}")

        return ctes

    def build_with_clause(self, ctes: List[exp.CTE], select_expr: exp.Select) -> exp.Select:
        """
        Add WITH clause containing CTEs to a SELECT expression.

        Args:
            ctes: List of CTE expressions
            select_expr: The SELECT expression to modify

        Returns:
            The modified SELECT expression with WITH clause
        """
        if not ctes:
            return select_expr
        for cte in ctes:
            select_expr = select_expr.with_(cte.alias, as_=cte.this)

        return select_expr
