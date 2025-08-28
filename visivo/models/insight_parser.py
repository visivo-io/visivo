from visivo.models.base.base_model import BaseModel
from visivo.models.base.query_string import QueryString
from visivo.query.dialect import Dialect
from visivo.models.insight import Insight
from visivo.models.insight_columns import InsightColumns
from visivo.models.models.model import Model
from visivo.models.props.insight_props import InsightProps
from visivo.models.sources.source import Source
from visivo.models.tokenized_insight import Interaction, InteractionType, TokenizedInsight
from visivo.query.statement_classifier import StatementClassifier, StatementEnum
from visivo.query.sqlglot_utils import (
    parse_expression,
    find_non_aggregated_columns,
    get_sqlglot_dialect,
)
import sqlglot
from typing import Dict, List, Set
import re


class InsightQueryParser:
    def __init__(self, insight: Insight, source: Source, model: Model):
        self.insight = insight
        self.source = source
        self.model = model
        self.source_type = source.type
        self.dialect = Dialect(type=source.type)
        self.sqlglot_dialect = get_sqlglot_dialect(source.type) if source.type else None
        self.statement_classifier = StatementClassifier(dialect=self.dialect)
        self.select_items = {}
        self.interaction_items = {}
        
    def tokenize(self) -> TokenizedInsight:
        self._extract_select_items()
        self._extract_interaction_items()
        
        pre_query = self._generate_pre_query()
        post_query = self._generate_post_query()
        interactions = self._process_interactions()
        
        return TokenizedInsight(
            name=self.insight.name,
            pre_query=pre_query,
            post_query=post_query,
            interactions=interactions,
            source=self.source.name,
            source_type=self.source_type
        )

    def _extract_select_items(self, obj=None, path=None):
        if path is None:
            path = []
        if obj is None:
            obj = self.insight
        
        if isinstance(obj, (InsightProps, InsightColumns)):
            props_dict = obj.model_dump()
            for key, value in props_dict.items():
                if value is not None:
                    self._extract_select_items(value, path + [key])
        elif isinstance(obj, BaseModel):
            for field_name in obj.model_fields:
                field_value = getattr(obj, field_name, None)
                if field_value is not None:
                    self._extract_select_items(field_value, path + [field_name])
        elif isinstance(obj, list):
            for i, item in enumerate(obj):
                self._extract_select_items(item, path + [str(i)])
        elif isinstance(obj, dict):
            for key, value in obj.items():
                self._extract_select_items(value, path + [key])
        else:
            query_id = ".".join(path)
            if isinstance(obj, QueryString):
                self.select_items[query_id] = obj.get_value()
            elif isinstance(obj, str) and re.match(r"^\?\{.*\}$", obj.strip()):
                self.select_items[query_id] = obj.strip()[2:-1].strip()

    def _extract_interaction_items(self):
        if not self.insight.interactions:
            return
            
        for i, interaction in enumerate(self.insight.interactions):
            if interaction.filter:
                # Extract the value if it's a QueryString
                filter_expr = interaction.filter
                if isinstance(filter_expr, QueryString):
                    filter_expr = filter_expr.get_value()
                self._add_interaction_item(filter_expr, "filter", i)
            
            if interaction.split:
                # Extract the value if it's a QueryString
                split_expr = interaction.split
                if isinstance(split_expr, QueryString):
                    split_expr = split_expr.get_value()
                self._add_interaction_item(split_expr, "split", i)
            
            if interaction.sort:
                # Extract the value if it's a QueryString
                sort_expr = interaction.sort
                if isinstance(sort_expr, QueryString):
                    sort_expr = sort_expr.get_value()
                self._add_interaction_item(sort_expr, "sort", i)

    def _add_interaction_item(self, expression: str, interaction_type: str, index: int):
        # Extract the actual SQL string if it's a QueryString object
        if isinstance(expression, QueryString):
            expression = expression.get_value()
        
        parsed = parse_expression(expression, self.sqlglot_dialect)
        classification = self.statement_classifier.classify(expression)
        
        self.interaction_items[f"{interaction_type}_{index}"] = {
            "expression": expression,
            "type": interaction_type,
            "classification": classification,
            "parsed": parsed
        }

    def _generate_pre_query(self) -> str:
        """
        Build the pre-query using sqlglot AST transformations
        """
        base_sql = self.model.sql
        base_ast = sqlglot.parse_one(base_sql, dialect=self.sqlglot_dialect)

        required_columns = self._analyze_required_columns()

        # Build select expressions with resolved aliases
        select_expressions = []
        column_map = {alias.split(".")[-1]: expr for alias, expr in self.select_items.items() if alias.startswith("columns.")}
        
        for alias, expression in self.select_items.items():
            resolved_expr = self._resolve_aliases(expression, column_map)
            parsed_expr = sqlglot.parse_one(resolved_expr, dialect=self.sqlglot_dialect)
            select_expressions.append(parsed_expr.as_(alias))

        # Add missing required columns
        for column in required_columns:
            if column not in self.select_items.values():
                select_expressions.append(sqlglot.parse_one(column, dialect=self.sqlglot_dialect))

        # Wrap base SQL in subquery
        subquery = base_ast.subquery("base")

        # Build SELECT ... FROM (base)
        query = sqlglot.exp.select(*select_expressions).from_(subquery)

        # Add WHERE (server-side filters)
        server_filters = self._build_server_side_filters()
        if server_filters:
            filter_expr = sqlglot.parse_one(server_filters, dialect=self.sqlglot_dialect)
            query = query.where(filter_expr)

        return query.sql(dialect=self.sqlglot_dialect)


    def _generate_post_query(self) -> str:
        """
        Build the post-query using sqlglot for filters/sorts
        """
        query = sqlglot.exp.select("*").from_("pre_query_result")

        # Apply window filters
        filter_expressions = [
            sqlglot.parse_one(item["expression"], dialect=self.sqlglot_dialect)
            for item in self.interaction_items.values()
            if item["type"] == "filter" and item["classification"] == StatementEnum.window
        ]
        if filter_expressions:
            combined_filter = sqlglot.exp.and_(*filter_expressions)
            query = query.where(combined_filter)

        # Apply sorting
        sort_expressions = [
            sqlglot.parse_one(item["expression"], dialect=self.sqlglot_dialect)
            for item in self.interaction_items.values()
            if item["type"] == "sort"
        ]
        if sort_expressions:
            query = query.order_by(*sort_expressions)

        return query.sql(dialect=self.sqlglot_dialect)


    def _analyze_required_columns(self) -> Set[str]:
        all_expressions = list(self.select_items.values()) + [
            item["expression"] for item in self.interaction_items.values()
        ]
        
        required_columns = set()
        for expr in all_expressions:
            parsed = parse_expression(expr, self.sqlglot_dialect)
            if parsed:
                columns = self._extract_column_references(parsed)
                required_columns.update(columns)
        
        return required_columns

    def _extract_column_references(self, parsed_expression) -> List[str]:
        columns = []
        for node in parsed_expression.walk():
            if isinstance(node, sqlglot.exp.Column):
                columns.append(node.sql())
        return columns
    
    def _resolve_aliases(self, expression: str, column_map: Dict[str, str]) -> str:
        """
        If the expression is just a column alias, replace it with the underlying SQL.
        Otherwise, return it unchanged.
        """
        expr = expression.strip()
        if expr in column_map:
            return column_map[expr]
        return expr


    def _build_select_clause(self, required_columns: Set[str]) -> str:
        select_parts = []

        # First build a map of columns.* → expression
        column_map = {}
        for alias, expression in self.select_items.items():
            if alias.startswith("columns."):
                column_name = alias.split(".")[-1]
                column_map[column_name] = expression

        for alias, expression in self.select_items.items():
            resolved_expr = self._resolve_aliases(expression, column_map)
            select_parts.append(f"{resolved_expr} AS \"{alias}\"")

        # Add any extra required columns not explicitly selected
        for column in required_columns:
            if column not in self.select_items.values():
                select_parts.append(column)

        return ", ".join(select_parts)

    def _build_server_side_filters(self) -> str:
        server_side_filters = []
        
        for item in self.interaction_items.values():
            if item["type"] == "filter" and item["classification"] != StatementEnum.window:
                server_side_filters.append(item["expression"])
        
        return " AND ".join(server_side_filters) if server_side_filters else ""

    def _process_interactions(self) -> List[Interaction]:
        interactions = []
        
        for item in self.interaction_items.values():
            interactions.append(Interaction(
                type=InteractionType(item["type"]),
                expression=item["expression"]
            ))
        
        return interactions