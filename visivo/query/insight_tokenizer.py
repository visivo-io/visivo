import re
from typing import Dict, List, Set, Any, Optional
import sqlglot
from sqlglot import exp

from visivo.models.insight import Insight, InsightInteraction
from visivo.models.props.layout import Layout
from visivo.models.sources.source import Source
from visivo.models.models.model import Model
from visivo.models.models.local_merge_model import LocalMergeModel
from visivo.models.tokenized_insight import TokenizedInsight
from visivo.models.trace_columns import TraceColumns
from visivo.models.props.trace_props import TraceProps
from visivo.models.base.base_model import BaseModel
from visivo.models.base.query_string import QueryString
from visivo.query.statement_classifier import StatementClassifier, StatementEnum
from visivo.utils import extract_value_from_function
from visivo.logger.logger import Logger


class InsightTokenizer:
    """
    Tokenizes insights to generate both server-side (pre) and client-side (post) queries.
    Uses SQLglot for intelligent query analysis and dependency detection.
    """

    def __init__(self, insight: Insight, model: Model, source: Source):
        self.insight = insight
        self.source = source
        self.model = model
        self.statement_classifier = StatementClassifier(source_type=source.type)

        # Analysis results
        self.select_items = {}  # prop_path -> sql_expression
        self.column_items = {}  # column_name -> sql_expression
        self.interaction_dependencies = {}  # interaction -> dependencies
        self.input_dependencies = set()  # All input names referenced
        self.required_columns = set()  # Columns needed in pre-query
        self.groupby_statements = set()  # GROUP BY expressions needed

        # Initialize analysis
        self._analyze_insight()

    def tokenize(self) -> TokenizedInsight:
        """Main entry point - returns tokenized insight with pre/post queries"""
        pre_query = self._generate_pre_query()
        post_query = self._generate_post_query()

        # Determine source type
        if isinstance(self.model, LocalMergeModel):
            source_type = "duckdb"
        elif self.source.type:
            source_type = self.source.type
        else:
            source_type = None

        return TokenizedInsight(
            name=self.insight.name,
            source=self.source.name,
            source_type=source_type,
            description=self.insight.description,
            pre_query=pre_query,
            post_query=post_query,
            select_items=self.select_items,
            column_items=self.column_items,
            interactions=self._serialize_interactions(),
            input_dependencies=list(self.input_dependencies),
            requires_groupby=len(self.groupby_statements) > 0,
            groupby_statements=list(self.groupby_statements) if self.groupby_statements else None,
            split_column=self._get_split_column(),
            sort_expressions=self._get_sort_expressions(),
        )

    def _analyze_insight(self):
        """Master analysis method that coordinates all parsing"""
        self._analyze_props()
        self._analyze_columns()
        self._analyze_interactions()
        self._determine_groupby_requirements()

    def _analyze_props(self):
        """Extract SQL expressions from insight props using recursive traversal"""
        self._extract_select_items(self.insight.props, ["props"])

    def _analyze_columns(self):
        """Extract SQL expressions from insight columns section"""
        if self.insight.columns:
            self._extract_select_items(self.insight.columns, ["columns"])

    def _extract_select_items(self, obj: Any, path: List[str]):
        """Recursively extract SQL expressions from nested objects"""
        if obj is None:
            return

        if isinstance(obj, (TraceProps, Layout)):
            # Get all fields including extra ones from the model dump
            props_dict = obj.model_dump()
            for key, value in props_dict.items():
                if value is not None:
                    self._extract_select_items(value, path + [key])

        elif isinstance(obj, BaseModel):
            for prop in obj.__class__.model_fields.keys():
                prop_value = getattr(obj, prop, None)
                if prop_value is not None:
                    self._extract_select_items(prop_value, path + [prop])

        elif isinstance(obj, TraceColumns):
            for key in obj.model_dump().keys():
                prop_value = getattr(obj, key, None)
                if prop_value is not None:
                    self._extract_select_items(prop_value, path + [key])

        elif isinstance(obj, list):
            for i, value in enumerate(obj):
                self._extract_select_items(value, path + [str(i)])

        elif isinstance(obj, dict):
            for key, value in obj.items():
                self._extract_select_items(value, path + [key])

        else:
            # This is a leaf value - extract SQL if it's a query
            query_id = ".".join(path)
            sql_expression = None

            if path[0] == "props":
                sql_expression = extract_value_from_function(obj, "query")
            elif path[0] == "columns":
                if isinstance(obj, QueryString):
                    sql_expression = obj.get_value()
                else:
                    sql_expression = str(obj)

            if sql_expression and query_id not in ("filter", "order_by"):
                if path[0] == "props":
                    self.select_items[query_id] = sql_expression
                elif path[0] == "columns":
                    self.column_items[query_id] = sql_expression

                # Analyze the SQL expression
                self._analyze_sql_expression(sql_expression)

    def _analyze_interactions(self):
        """Parse interactions to understand client-side requirements"""
        if not self.insight.interactions:
            return

        for interaction in self.insight.interactions:
            interaction_deps = set()

            # Analyze filter interactions
            if interaction.filter:
                filter_expr = extract_value_from_function(interaction.filter, "query")
                if filter_expr:
                    input_refs = self._find_input_references(filter_expr)
                    interaction_deps.update(input_refs)
                    self.input_dependencies.update(input_refs)

                    # Add columns referenced in filter to required columns
                    columns = self._extract_column_dependencies(filter_expr)
                    self.required_columns.update(columns)

            # Analyze split interactions
            if interaction.split:
                split_expr = extract_value_from_function(interaction.split, "query")
                if split_expr:
                    columns = self._extract_column_dependencies(split_expr)
                    self.required_columns.update(columns)

            # Analyze sort interactions
            if interaction.sort:
                sort_expr = extract_value_from_function(interaction.sort, "query")
                if sort_expr:
                    columns = self._extract_column_dependencies(sort_expr)
                    self.required_columns.update(columns)

    def _analyze_sql_expression(self, sql_expr: str):
        """Use SQLglot to analyze a SQL expression for aggregations and dependencies"""
        try:
            # Parse the expression
            parsed = sqlglot.parse_one(sql_expr, dialect=self._get_sqlglot_dialect())

            # Check for aggregation functions
            if self._has_aggregation(parsed):
                # Add columns used in aggregation to groupby requirements
                columns = self._extract_non_aggregated_columns(parsed)
                self.groupby_statements.update(columns)

        except Exception as e:
            # If SQLglot parsing fails, fall back to simple analysis
            Logger.instance().debug(f"SQLglot parsing failed for '{sql_expr}': {e}")
            self._fallback_aggregation_analysis(sql_expr)

    def _fallback_aggregation_analysis(self, sql_expr: str):
        """Fallback aggregation detection using simple pattern matching"""
        agg_functions = [
            "sum(",
            "count(",
            "avg(",
            "min(",
            "max(",
            "sum (",
            "count (",
            "avg (",
            "min (",
            "max (",
        ]
        sql_lower = sql_expr.lower()

        if any(agg in sql_lower for agg in agg_functions):
            # This expression has aggregation - we need to find non-aggregated columns
            # For now, add any column-like patterns that aren't inside the aggregation
            import re

            # Simple pattern to find potential column names not inside parentheses
            column_pattern = r"\b([a-zA-Z_][a-zA-Z0-9_]*)\b"
            matches = re.findall(column_pattern, sql_expr)

            # Filter out SQL keywords and function names
            sql_keywords = {
                "select",
                "from",
                "where",
                "group",
                "by",
                "order",
                "having",
                "and",
                "or",
                "not",
                "sum",
                "count",
                "avg",
                "min",
                "max",
            }

            for match in matches:
                if match.lower() not in sql_keywords:
                    # Check if this column is not inside a function call
                    if not self._is_inside_function(sql_expr, match):
                        self.groupby_statements.add(match)

    def _is_inside_function(self, sql_expr: str, column: str) -> bool:
        """Check if a column reference is inside a function call"""
        # Simple check to see if column appears inside parentheses after a function name
        import re

        pattern = rf"\w+\([^)]*\b{re.escape(column)}\b[^)]*\)"
        return bool(re.search(pattern, sql_expr, re.IGNORECASE))

    def _has_aggregation(self, parsed_expr) -> bool:
        """Check if parsed expression contains aggregation functions"""
        agg_functions = list(parsed_expr.find_all(exp.AggFunc))
        return len(agg_functions) > 0

    def _extract_column_dependencies(self, sql_expr: str) -> List[str]:
        """Get list of columns referenced in expression"""
        try:
            parsed = sqlglot.parse_one(sql_expr, dialect=self._get_sqlglot_dialect())
            columns = []
            for column in parsed.find_all(exp.Column):
                if column.name:
                    columns.append(column.name)
            return columns
        except Exception:
            # Fallback to regex-based extraction
            column_pattern = r"\b([a-zA-Z_][a-zA-Z0-9_]*)\b"
            matches = re.findall(column_pattern, sql_expr)
            # Filter out SQL keywords
            sql_keywords = {
                "select",
                "from",
                "where",
                "group",
                "by",
                "order",
                "having",
                "and",
                "or",
                "not",
            }
            return [match for match in matches if match.lower() not in sql_keywords]

    def _extract_non_aggregated_columns(self, parsed_expr) -> Set[str]:
        """Extract column names that are not inside aggregation functions"""
        columns = set()

        # Find all column references
        for column in parsed_expr.find_all(exp.Column):
            if column.name:
                # Check if this column is inside an aggregation function
                parent = column.parent
                inside_agg = False
                while parent:
                    if isinstance(parent, exp.AggFunc):
                        inside_agg = True
                        break
                    parent = parent.parent

                if not inside_agg:
                    columns.add(column.name)

        return columns

    def _find_input_references(self, text: str) -> Set[str]:
        """Find ${ref(...)} patterns in text"""
        pattern = r"\$\{ref\(([^)]+)\)"
        matches = re.findall(pattern, text)
        return set(match.strip("'\"") for match in matches)

    def _determine_groupby_requirements(self):
        """Determine final GROUP BY requirements"""
        # If we have any aggregation functions, we need to add all non-aggregated columns to GROUP BY
        has_any_aggregation = False
        all_referenced_columns = set()

        # Check all select items for aggregations and collect all columns
        for expr in list(self.select_items.values()) + list(self.column_items.values()):
            if self._has_aggregation_simple(expr):
                has_any_aggregation = True
            # Collect all columns referenced in this expression
            columns = self._extract_column_dependencies(expr)
            all_referenced_columns.update(columns)

        # If we have aggregations, add all non-aggregated columns to GROUP BY
        if has_any_aggregation:
            for column in all_referenced_columns:
                if not self._is_column_inside_aggregation(column):
                    self.groupby_statements.add(column)

        # Include columns from interactions that need to be grouped
        for column in self.required_columns:
            # Only add non-aggregated columns to GROUP BY
            if not self._is_column_aggregated(column):
                self.groupby_statements.add(column)

    def _has_aggregation_simple(self, sql_expr: str) -> bool:
        """Simple check for aggregation functions in an expression"""
        agg_functions = [
            "sum(",
            "count(",
            "avg(",
            "min(",
            "max(",
            "sum (",
            "count (",
            "avg (",
            "min (",
            "max (",
        ]
        sql_lower = sql_expr.lower()
        return any(agg in sql_lower for agg in agg_functions)

    def _is_column_inside_aggregation(self, column: str) -> bool:
        """Check if a column is used only inside aggregation functions across all expressions"""
        # Check all expressions to see if this column appears outside of aggregation functions
        for expr in list(self.select_items.values()) + list(self.column_items.values()):
            if column.lower() in expr.lower():
                # If column appears in expression but not inside a function, it needs GROUP BY
                if not self._is_inside_function(expr, column):
                    return False
        return True

    def _is_column_aggregated(self, column: str) -> bool:
        """Check if a column is used in an aggregated context"""
        # This is a simplified check - in practice might need more sophisticated analysis
        for expr in list(self.select_items.values()) + list(self.column_items.values()):
            if column in expr and any(
                agg in expr.lower() for agg in ["sum(", "count(", "avg(", "min(", "max("]
            ):
                return True
        return False

    def _generate_pre_query(self) -> str:
        """Generate server-side SQL query"""
        # Start with base model SQL
        base_sql = self.model.sql

        # Build SELECT clause
        select_parts = []

        # Add all prop expressions
        for prop_path, sql_expr in self.select_items.items():
            select_parts.append(f'{sql_expr} as "{prop_path}"')

        # Add all column expressions
        for column_path, sql_expr in self.column_items.items():
            select_parts.append(f'{sql_expr} as "{column_path}"')

        # Add required columns for interactions
        for column in self.required_columns:
            if column not in [expr for expr in self.column_items.values()]:
                select_parts.append(f"{column}")

        # Build the query
        if select_parts:
            select_clause = "SELECT " + ",\n  ".join(select_parts)
        else:
            select_clause = "SELECT *"

        query = f"{select_clause}\nFROM ({base_sql}) as base_model"

        # Add GROUP BY if needed
        if self.groupby_statements:
            groupby_clause = "GROUP BY " + ", ".join(self.groupby_statements)
            query += f"\n{groupby_clause}"

        return query

    def _generate_post_query(self) -> str:
        """Generate client-side DuckDB query template"""
        # Start with basic SELECT
        query = "SELECT * FROM insight_data"

        # Add WHERE clauses for filters with input variables
        filter_conditions = []
        if self.insight.interactions:
            for interaction in self.insight.interactions:
                if interaction.filter:
                    filter_expr = extract_value_from_function(interaction.filter, "query")
                    if filter_expr and self._find_input_references(filter_expr):
                        # Replace input references with parameter placeholders
                        parameterized = self._parameterize_input_references(filter_expr)
                        filter_conditions.append(parameterized)

        if filter_conditions:
            query += "\nWHERE " + " AND ".join(filter_conditions)

        return query

    def _parameterize_input_references(self, expr: str) -> str:
        """Replace ${ref(input).value} with parameter placeholders"""
        # For now, return as-is - client will handle substitution
        return expr

    def _serialize_interactions(self) -> List[Dict[str, Any]]:
        """Convert interactions to serializable format"""
        if not self.insight.interactions:
            return []

        result = []
        for interaction in self.insight.interactions:
            interaction_dict = {}

            if interaction.filter:
                filter_expr = extract_value_from_function(interaction.filter, "query")
                if filter_expr:
                    interaction_dict["filter"] = filter_expr

            if interaction.split:
                split_expr = extract_value_from_function(interaction.split, "query")
                if split_expr:
                    interaction_dict["split"] = split_expr

            if interaction.sort:
                sort_expr = extract_value_from_function(interaction.sort, "query")
                if sort_expr:
                    interaction_dict["sort"] = sort_expr

            if interaction_dict:
                result.append(interaction_dict)

        return result

    def _get_split_column(self) -> Optional[str]:
        """Get the column used for splitting data into multiple traces"""
        if self.insight.interactions:
            for interaction in self.insight.interactions:
                if interaction.split:
                    return extract_value_from_function(interaction.split, "query")
        return None

    def _get_sort_expressions(self) -> Optional[List[str]]:
        """Get sort expressions for client-side ordering"""
        sort_exprs = []
        if self.insight.interactions:
            for interaction in self.insight.interactions:
                if interaction.sort:
                    sort_expr = extract_value_from_function(interaction.sort, "query")
                    if sort_expr:
                        sort_exprs.append(sort_expr)
        return sort_exprs if sort_exprs else None

    def _get_sqlglot_dialect(self) -> str:
        """Map Visivo dialect to SQLglot dialect"""
        dialect_mapping = {
            "snowflake": "snowflake",
            "bigquery": "bigquery",
            "postgres": "postgres",
            "redshift": "postgres",  # Redshift is based on Postgres
            "mysql": "mysql",
            "sqlite": "sqlite",
            "duckdb": "duckdb",
        }
        return dialect_mapping.get(self.source.type, "")
