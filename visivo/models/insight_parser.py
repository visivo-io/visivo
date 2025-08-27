from pydantic import BaseModel
import sqlglot
from sqlglot import expressions as exp, parse_one
from typing import Dict, List, Optional, Tuple
from enum import Enum

from visivo.logger.logger import Logger
from visivo.models.base.query_string import QueryString
from visivo.models.insight import Insight
from visivo.models.insight_columns import InsightColumns
from visivo.models.models.local_merge_model import LocalMergeModel
from visivo.models.models.model import Model
from visivo.models.props.insight_props import InsightProps
from visivo.models.sources.source import Source
from visivo.models.tokenized_insight import Interaction, InteractionType, TokenizedInsight
from visivo.query.dialect import Dialect
from visivo.query.statement_classifier import StatementClassifier, StatementEnum
from visivo.utils import extract_value_from_function


class QueryPart(Enum):
    PRE = "pre"
    POST = "post"


class InsightQueryParser:
    def __init__(self, insight: Insight, model: Model, source: Source):
        self.insight = insight
        self.source = source
        self.model = model
        self.dialect = Dialect(type=source.type)
        self.statement_classifier = StatementClassifier(dialect=self.dialect)
        self.select_items = self._extract_select_items()
        self.interactions = self._extract_interactions()

    def tokenize(self) -> TokenizedInsight:
        pre_query = self._generate_pre_query()
        post_query = self._generate_post_query()

        # Optimize query split based on expression analysis
        pre_query, post_query = self._optimize_query_split(pre_query, post_query)

        source_type = self._determine_source_type()

        return TokenizedInsight(
            name=self.insight.name,
            pre_query=pre_query,
            post_query=post_query,
            interactions=self.interactions,
            source=self.source.name,
            source_type=source_type,
        )

    def _extract_select_items(self) -> Dict[str, str]:
        """Extract all expressions from props and columns"""
        select_items = {}

        # Extract from props (x, y, and any other expression-based properties)
        props_dict = self.insight.props.dict(exclude_unset=True)
        for prop_name, prop_value in props_dict.items():
            if isinstance(prop_value, str) and prop_value.startswith("?{"):
                select_items[prop_name] = extract_value_from_function(prop_value, "query")

        # Extract from columns
        columns_dict = (
            self.insight.columns.model_dump(exclude_unset=True)
            if self.insight.columns is not None
            else {}
        )

        for column_name, column_expr in columns_dict.items():
            if isinstance(column_expr, str) and column_expr.startswith("?{"):
                select_items[column_name] = extract_value_from_function(column_expr, "query")

        return select_items

    def _extract_interactions(self) -> List[Interaction]:
        """Extract and validate interactions"""
        interactions = []

        if not self.insight.interactions:
            return interactions

        for interaction in self.insight.interactions:
            if interaction.filter:
                expr = extract_value_from_function(interaction.filter, "query")
                interactions.append(Interaction(type=InteractionType.FILTER, expression=expr))

            if interaction.split:
                expr = extract_value_from_function(interaction.split, "query")
                interactions.append(Interaction(type=InteractionType.SPLIT, expression=expr))

            if interaction.sort:
                expr = extract_value_from_function(interaction.sort, "query")
                interactions.append(Interaction(type=InteractionType.SORT, expression=expr))

        return interactions

    def _generate_pre_query(self) -> str:
        base_query = self.model.sql

        select_exprs = []
        derived_exprs = []
        aliases_defined = set()

        all_aliases = set(self.select_items.keys())

        for alias, expr in self.select_items.items():
            parsed = parse_one(expr, read=self.dialect.type)

            refs_alias = any(
                isinstance(node, exp.Column) and node.name in all_aliases
                for node in parsed.find_all(exp.Column)
            )

            alias_expr = exp.alias_(parsed, alias)

            if refs_alias and alias not in aliases_defined:
                # Needs to go to outer query
                derived_exprs.append(alias_expr)
            else:
                select_exprs.append(alias_expr)
                aliases_defined.add(alias)

        if derived_exprs:
            inner_select = exp.select(*select_exprs).from_(
                exp.Subquery(this=parse_one(base_query), alias="base")
            )

            cte_alias = "cte_inner"

            # outer select should include *all* expressions
            outer_select = exp.select(*(select_exprs + derived_exprs)).from_(
                exp.to_table(cte_alias)
            )

            query = exp.With(
                expressions=[exp.CTE(this=inner_select, alias=exp.to_table(cte_alias))],
                this=outer_select,
            )

            return query.sql(dialect=self.dialect.type)

        return (
            exp.select(*select_exprs)
            .from_(f"({base_query}) AS base")
            .sql(dialect=self.dialect.type)
        )

    def _generate_post_query(self) -> str:
        """Generate initial client-side query"""
        columns = list(self.select_items.keys())
        return f"SELECT {', '.join(columns)} FROM {self.insight.name}"

    def _optimize_query_split(self, pre_query: str, post_query: str) -> Tuple[str, str]:
        """
        Analyze expressions and move appropriate ones to client-side processing
        """
        try:
            parsed_pre = parse_one(pre_query, read=self.dialect.type)

            # Extract and classify all expressions
            pre_expressions = []
            post_expressions = []

            for select_expr in parsed_pre.find_all(exp.Select):
                for expr in select_expr.expressions:
                    expr_str = expr.sql()
                    classification = self.statement_classifier.classify(expr_str)

                    if self._should_be_pre_query(expr_str, classification):
                        pre_expressions.append(expr)
                    else:
                        post_expressions.append(expr)

            # Rebuild queries
            new_pre_query = self._rebuild_pre_query(pre_expressions)
            new_post_query = self._rebuild_post_query(post_expressions)

            return new_pre_query, new_post_query

        except Exception as e:
            Logger.instance().error(f"Query optimization failed: {e}")
            return pre_query, post_query

    def _should_be_pre_query(self, expression: str, classification: StatementEnum) -> bool:
        """
        Determine if expression should be processed server-side
        """
        # Always keep aggregates and window functions server-side
        if classification in [StatementEnum.aggregate, StatementEnum.window]:
            return True

        # Keep complex expressions and unsupported functions server-side
        unsupported_functions = {"try_cast", "replace", "cast"}
        parsed_expr = parse_one(expression)

        if any(str(func) in unsupported_functions for func in parsed_expr.find_all(exp.Func)):
            return True

        # Simple column references can move to client
        if classification == StatementEnum.vanilla and isinstance(
            parsed_expr, (exp.Column, exp.Identifier)
        ):
            return False

        return True

    def _rebuild_pre_query(self, expressions: List[exp.Expression]) -> str:
        """Rebuild pre-query with specified expressions"""
        if not expressions:
            return f"SELECT 1 FROM ({self.model.sql}) AS base LIMIT 0"

        select_clauses = [expr.sql() for expr in expressions]
        return f"SELECT {', '.join(select_clauses)} FROM ({self.model.sql}) AS base"

    def _rebuild_post_query(self, expressions: List[exp.Expression]) -> str:
        """Rebuild post-query with specified expressions"""
        if not expressions:
            return f"SELECT * FROM {self.insight.name}"

        select_clauses = [expr.sql() for expr in expressions]
        return f"SELECT {', '.join(select_clauses)} FROM {self.insight.name}"

    def _determine_source_type(self) -> Optional[str]:
        """Determine appropriate source type for the query"""
        if isinstance(self.model, LocalMergeModel):
            return "duckdb"
        return self.source.type if self.source.type else None
