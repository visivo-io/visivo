import re
from typing import Dict, List, Tuple, Optional, Any
import sqlglot
import sqlglot.expressions as exp
from sqlglot.dialects.dialect import Dialect as SQLGlotDialect
from visivo.models.base.base_model import BaseModel
from visivo.models.insight import Insight
from visivo.models.insight_columns import InsightColumns
from visivo.models.models.model import Model
from visivo.models.sources.source import Source
from visivo.query.dialect import Dialect as VisivoDialect
from visivo.query.statement_classifier import StatementClassifier
from visivo.utils import extract_value_from_function
import warnings

class InsightQueryParser:
    def __init__(self, insight: Insight, model: Model, source: Source):
        self.insight = insight
        self.model = model
        self.source = source
        self.visivo_dialect = VisivoDialect(type=source.type)
        self.statement_classifier = StatementClassifier(dialect=self.visivo_dialect)
        self.select_items = {}
        self._set_select_items()
        
    def parse_queries(self) -> Tuple[str, str]:
        """
        Generate pre and post queries for the insight.
        Returns: (pre_query, post_query)
        """
        # Parse base model query with SQLGlot
        base_parsed = self._parse_base_query()
        
        # Build pre-query with additional columns
        pre_query = self._build_pre_query(base_parsed)
        
        # # Build initial post-query
        post_query = self._build_initial_post_query()
        
        # # Process interactions for post-query
        post_query = self._process_interactions(post_query)
        
        return pre_query.sql(dialect=self.visivo_dialect.type), post_query
    
    def _parse_base_query(self) -> exp.Expression:
        """Parse the base model SQL using SQLGlot"""
        try:
            return sqlglot.parse_one(self.model.sql, read=self.visivo_dialect.type)
        except Exception as e:
            warnings.warn(f"Failed to parse base query: {e}")
            # Fallback: wrap raw SQL in a subquery
            return exp.select("*").from_(exp.subquery(
                exp.column(self.model.sql), "base_data"
            ))
    
    def _build_pre_query(self, base_parsed: exp.Expression) -> exp.Expression:
        """Add insight columns to the base query"""
        if not isinstance(base_parsed, exp.Select):
            base_parsed = exp.select("*").from_(exp.subquery(base_parsed, "base_data"))
        
        # Add columns from insight definition
        if self.insight.columns:
            for col_name, col_value in self.insight.columns.model_dump().items():
                col_expr = self._extract_expression_string(col_value)
                try:
                    col_parsed = sqlglot.parse_one(col_expr, read=self.visivo_dialect.type)
                    base_parsed = base_parsed.select(col_parsed, alias=col_name)
                except Exception as e:
                    warnings.warn(f"Failed to parse column {col_name}: {e}")
                    base_parsed = base_parsed.select(exp.column(col_expr), alias=col_name)
        
        return base_parsed
    
    def _build_initial_post_query(self) -> str:
        """Create initial post-query for client-side"""
        return f"SELECT * FROM {self.insight.name}"
    
    def _process_interactions(self, post_query: str) -> str:
        """Add interaction logic to post-query using SQLGlot"""
        if not self.insight.interactions:
            return post_query
        
        try:
            parsed_post = sqlglot.parse_one(post_query, read="duckdb")
            where_conditions = []
            order_expressions = []
            
            for interaction in self.insight.interactions:
                if interaction.filter:
                    expr = self._extract_expression_string(interaction.filter)
                    where_conditions.append(sqlglot.parse_one(expr, read="duckdb"))
                if interaction.sort:
                    expr = self._extract_expression_string(interaction.sort)
                    order_expressions.append(sqlglot.parse_one(expr, read="duckdb"))
            
            # Apply WHERE conditions
            if where_conditions:
                parsed_post = self._apply_where_conditions(parsed_post, where_conditions)
            
            # Apply ORDER BY
            if order_expressions:
                parsed_post = self._apply_order_by(parsed_post, order_expressions)
            
            return parsed_post.sql(dialect="duckdb")
        except Exception as e:
            warnings.warn(f"Failed to process interactions: {e}")
            return post_query
    
    def _extract_expression_string(self, expression: Any) -> str:
        """Extract SQL expression from various formats"""
        if hasattr(expression, 'get_value'):
            return expression.get_value()
        elif isinstance(expression, str):
            if expression.startswith('?{') and expression.endswith('}'):
                return expression[2:-1].strip()
            de_query = extract_value_from_function(expression, "query")
            return de_query if de_query else expression
        return str(expression)
    
    def _apply_where_conditions(self, query: exp.Expression, conditions: List[exp.Expression]) -> exp.Expression:
        """Apply WHERE conditions to query"""
        if not isinstance(query, exp.Select):
            return query
        
        combined_condition = conditions[0]
        for condition in conditions[1:]:
            combined_condition = exp.and_(combined_condition, condition)
        
        return query.where(combined_condition)
    
    def _apply_order_by(self, query: exp.Expression, order_exprs: List[exp.Expression]) -> exp.Expression:
        """Apply ORDER BY to query"""
        if not isinstance(query, exp.Select):
            return query
        
        order_by_exprs = []
        for expr in order_exprs:
            if isinstance(expr, exp.Order):
                order_by_exprs.append(expr)
            else:
                order_by_exprs.append(exp.Order(this=expr))
        
        return query.order_by(*order_by_exprs)
    
    def _set_select_items(self, obj=None, path=None):
        """
        Extract select items from insight configuration for compatibility and debugging.
        Adapted from TraceTokenizer but modified for Insight structure.
        """
        if path is None:
            path = []
        
        if obj is None:
            obj = self.insight
        
        # Handle Insight object
        if isinstance(obj, Insight):
            # Process props
            if obj.props:
                self._set_select_items(obj.props, path + ["props"])
            # Process columns
            if obj.columns:
                self._set_select_items(obj.columns, path + ["columns"])
            # Process interactions
            if obj.interactions:
                self._set_select_items(obj.interactions, path + ["interactions"])
        
        # Handle BaseModel objects (props, columns, interactions)
        elif isinstance(obj, BaseModel):
            for prop in obj.model_fields.keys():
                prop_value = getattr(obj, prop, None)
                if prop_value is not None:
                    self._set_select_items(prop_value, path + [prop])
        
        # Handle InsightColumns (which allows extra fields)
        elif isinstance(obj, InsightColumns):
            for key in obj.model_dump().keys():
                prop_value = getattr(obj, key, None)
                if prop_value is not None:
                    self._set_select_items(prop_value, path + [key])
        
        # Handle lists (e.g., interactions list)
        elif isinstance(obj, list):
            for i, item in enumerate(obj):
                self._set_select_items(item, path + [str(i)])
        
        # Handle dictionaries
        # elif isinstance(obj, dict):
        #     for key, value in obj.items():
        #         self._set_select_items(value, path + [key])
        
        # Handle leaf values - extract query statements
        else:
            query_id = ".".join([str(part) for part in path])
            query_statement = None
            
            # Extract query statements based on path context
            if len(path) > 0:
                if path[0] == "props":
                    # Extract from props using query function syntax
                    query_statement = extract_value_from_function(str(obj), "query")
                
                elif path[0] == "columns":
                    # Extract from columns - handle QueryString objects or strings
                    if hasattr(obj, 'get_value'):
                        query_statement = obj.get_value()
                    elif isinstance(obj, str):
                        # Handle ?{...} format for columns
                        if obj.startswith('?{') and obj.endswith('}'):
                            query_statement = obj[2:-1].strip()
                        else:
                            query_statement = obj
                
                elif path[0] == "interactions":
                    # Extract from interactions
                    if len(path) >= 3:  # interactions.[index].(filter|split|sort)
                        interaction_type = path[2]
                        if interaction_type in ["filter", "split", "sort"]:
                            query_statement = self._extract_expression_string(obj)
            
            # Store the query statement if found and not excluded
            if (query_statement and 
                query_id not in ("cohort_on", "filter", "order_by") and
                not re.findall(r"^\s*'.*'\s*$", str(query_statement))):
                
                # Classify the statement for potential use in query analysis
                try:
                    classification = self.statement_classifier.classify(query_statement)
                    self.select_items[query_id] = {
                        "statement": query_statement,
                        "classification": classification,
                        "path": path
                    }
                except Exception as e:
                    # Store without classification if classification fails
                    self.select_items[query_id] = {
                        "statement": query_statement,
                        "classification": None,
                        "path": path,
                        "error": str(e)
                    }