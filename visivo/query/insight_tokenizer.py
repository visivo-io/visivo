import re
from typing import Dict, List, Set, Any, Optional
from sqlglot import exp

from visivo.models.insight import Insight
from visivo.models.insight_columns import InsightColumns
from visivo.models.props.insight_props import InsightProps
from visivo.models.props.layout import Layout
from visivo.models.sources.source import Source
from visivo.models.models.model import Model
from visivo.models.models.local_merge_model import LocalMergeModel
from visivo.models.tokenized_insight import TokenizedInsight
from visivo.models.base.base_model import BaseModel
from visivo.models.base.query_string import QueryString
from visivo.parsers.serializer import Serializer
from visivo.query.sqlglot_utils import (
    extract_column_references,
    find_non_aggregated_columns,
    get_sqlglot_dialect,
    has_aggregate_function,
    parse_expression,
)
from visivo.query.statement_classifier import StatementClassifier
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
        self.source_type = source.type
        self.sqlglot_dialect = get_sqlglot_dialect(source.get_dialect()) if source.type else None
        self.statement_classifier = StatementClassifier(source_type=self.source_type)

        # Analysis results
        self.select_items = {}  # prop_path -> sql_expression
        self.selects = {}  # prop_path -> items
        self.columns = {}  # column_name -> items
        self.column_items = {}  # column_name -> sql_expression
        self.interaction_dependencies = {}  # interaction -> dependencies
        self.input_dependencies = set()  # All input names referenced
        self.required_columns = set()  # Columns needed in pre-query
        self.groupby_statements = set()  # GROUP BY expressions needed
        self.is_dynamic_interactions = False

        self._analyze_insight()

    def parse_duckdb(self, query: str) -> str:
        try:
            return parse_expression(query, dialect="duckdb").sql()
        except:
            return query

    def tokenize(self) -> TokenizedInsight:
        """Main entry point - returns tokenized insight with pre/post queries"""
        pre_query = self._generate_pre_query()
        post_query = self._generate_post_query()

        if self.is_dynamic_interactions:
            pre_query, post_query = post_query, pre_query
            post_query = self.parse_duckdb(post_query)

        # Determine source type
        if isinstance(self.model, LocalMergeModel):
            source_type = "duckdb"
        elif self.source.type:
            source_type = self.source.type
        else:
            source_type = None

        if self.insight.props:
            props = self.insight.props.model_dump()
        else:
            props = None

        return TokenizedInsight(
            name=self.insight.name,
            source=self.source.name,
            source_type=source_type,
            description=self.insight.description,
            pre_query=pre_query,
            post_query=post_query,
            select_items=self.select_items,
            column_items=self.column_items,
            selects=self.selects,
            columns=self.columns,
            props=props,
            interactions=self._serialize_interactions(),
            input_dependencies=list(self.input_dependencies),
            requires_groupby=len(self.groupby_statements) > 0,
            groupby_statements=list(self.groupby_statements) if self.groupby_statements else None,
            split_column=self._get_split_column(),
            sort_expressions=self._get_sort_expressions(),
            is_dynamic_interactions=self.is_dynamic_interactions,
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

        if isinstance(obj, (InsightProps, Layout)):
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

        elif isinstance(obj, InsightColumns):
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
            if path[0] in ("props", "columns"):
                expression = QueryString(obj).get_value()
                if expression:
                    sql_expression = expression

            if sql_expression and query_id not in ("filter", "order_by"):
                if path[0] == "props":
                    self.select_items[query_id] = sql_expression
                else:
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
                filter_expr = interaction.filter.get_value()
                if filter_expr:
                    interaction_deps.update(filter_expr)
                    # Add columns referenced in filter to required columns
                    columns = self._extract_column_dependencies(filter_expr)
                    self.required_columns.update(columns)

            # Analyze split interactions
            if interaction.split:
                split_expr = interaction.split.get_value()
                if split_expr:
                    columns = self._extract_column_dependencies(split_expr)
                    self.required_columns.update(columns)

            # Analyze sort interactions
            if interaction.sort:
                sort_expr = interaction.sort.get_value()
                if sort_expr:
                    columns = self._extract_column_dependencies(sort_expr)
                    self.required_columns.update(columns)

    def _analyze_sql_expression(self, sql_expr: str):
        """Use SQLglot to analyze a SQL expression for aggregations and dependencies"""
        try:
            parsed = parse_expression(sql_expr, dialect=self.sqlglot_dialect)

            if has_aggregate_function(parsed):
                non_aggregated_cols = find_non_aggregated_columns(parsed)
                self.groupby_statements.update(non_aggregated_cols)

        except Exception as e:
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
            import re

            # Simple pattern to find potential column names not inside parentheses
            column_pattern = r"\b([a-zA-Z_][a-zA-Z0-9_]*)\b"
            matches = re.findall(column_pattern, sql_expr)

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
        import re

        pattern = rf"\w+\([^)]*\b{re.escape(column)}\b[^)]*\)"
        return bool(re.search(pattern, sql_expr, re.IGNORECASE))

    def _extract_column_dependencies(self, sql_expr: str) -> List[str]:
        """Get list of columns referenced in expression"""
        try:
            parsed = parse_expression(sql_expr, dialect=self.sqlglot_dialect)
            return extract_column_references(parsed)
        except Exception:
            column_pattern = r"\b([a-zA-Z_][a-zA-Z0-9_]*)\b"
            matches = re.findall(column_pattern, sql_expr)
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

    def _determine_groupby_requirements(self):
        """Determine final GROUP BY requirements"""

        has_any_aggregation = False
        all_referenced_columns = set()

        for expr in list(self.select_items.values()) + list(self.column_items.values()):
            try:
                parsed = parse_expression(expr, dialect=self.sqlglot_dialect)
            except Exception:
                parsed = None

            if parsed and has_aggregate_function(parsed):
                has_any_aggregation = True
                all_referenced_columns.update(find_non_aggregated_columns(parsed))
            else:
                all_referenced_columns.update(self._extract_column_dependencies(expr))

        if has_any_aggregation:
            derived_targets = set()
            for expr in self.column_items.values():
                try:
                    parsed = parse_expression(expr, dialect=self.sqlglot_dialect)
                except Exception:
                    parsed = None
                if parsed:
                    for col in parsed.find_all(exp.Column):
                        derived_targets.add(col.name)

            for column in all_referenced_columns.union(self.required_columns):
                if column not in derived_targets and not self._is_column_inside_aggregation(column):
                    self.groupby_statements.add(column)

    def _is_column_inside_aggregation(self, column: str) -> bool:
        """Check if a column is used only inside aggregation functions across all expressions"""
        for expr in list(self.select_items.values()) + list(self.column_items.values()):
            if column.lower() in expr.lower():
                if not self._is_inside_function(expr, column):
                    return False
        return True

    def _generate_pre_query(self) -> str:
        """
        Generate server-side SQL query with precomputed CTE for duplicated and complex expressions.
        """
        for interaction in self.insight.interactions or []:
            if interaction.filter:
                filter_expr = interaction.filter.get_value()
                if filter_expr:
                    if self._is_dynamic(filter_expr):
                        self.is_dynamic_interactions = True

        if self.is_dynamic_interactions:
            base_sql_expr = parse_expression(
                f"SELECT * FROM '{self.insight.name}'", dialect="duckdb"
            )
        else:
            base_sql_expr = parse_expression(self.model.sql, dialect=self.sqlglot_dialect)

        occurrences = {}

        def register(expr_sql: str, kind: str, target: str, preferred_alias: Optional[str] = None):
            if not expr_sql:
                return
            norm = self._normalize_expr_sql(expr_sql)
            if not norm:
                return
            occ = occurrences.setdefault(
                norm, {"orig": expr_sql, "count": 0, "targets": [], "preferred_aliases": set()}
            )
            occ["count"] += 1
            occ["targets"].append({"kind": kind, "target": target, "expr": expr_sql})
            if preferred_alias:
                occ["preferred_aliases"].add(preferred_alias)

        # Register column expressions
        for column_path, sql_expr in self.column_items.items():
            short = column_path.split(".", 1)[1]
            register(sql_expr, "column", column_path, preferred_alias=short)

        # Register prop expressions
        for prop_path, sql_expr in self.select_items.items():
            short_prop = prop_path.split(".", 1)[1]
            if isinstance(sql_expr, str) and sql_expr.startswith("columns."):
                col_key = sql_expr
                col_expr = self.column_items.get(col_key)
                if col_expr:
                    register(col_expr, "prop", prop_path, preferred_alias=col_key.split(".", 1)[1])
                else:
                    register(short_prop, "prop", prop_path, preferred_alias=short_prop)
            else:
                register(sql_expr, "prop", prop_path, preferred_alias=short_prop)

        # Register required columns
        for req in list(self.required_columns or []):
            register(req, "required", req, preferred_alias=req)

        # Build alias map
        alias_map, used_aliases = {}, set()
        for norm, info in occurrences.items():
            # Always alias if expression is not a simple column
            force_alias = "(" in info["orig"] or ")" in info["orig"] or " " in info["orig"]
            if info["count"] > 1 or force_alias:
                preferred_alias = None
                if info["preferred_aliases"]:
                    preferred_alias = sorted(info["preferred_aliases"], key=len)[0]
                alias = self._make_alias_name(preferred_alias, used_aliases, prefix="expr")
                alias_map[norm] = alias

        # Projections for outer query (always reference aliases when available)
        outer_projections = []
        for column_path, sql_expr in self.column_items.items():
            norm = self._normalize_expr_sql(sql_expr)
            alias = alias_map.get(norm)
            if alias:
                self.columns[column_path] = alias
            outer_projections.append(exp.column(alias or sql_expr))

        for prop_path, sql_expr in self.select_items.items():
            if isinstance(sql_expr, str) and sql_expr.startswith("columns."):
                col_expr = self.column_items.get(sql_expr)
                if col_expr:
                    norm = self._normalize_expr_sql(col_expr)
                    alias = alias_map.get(norm)
                    outer_projections.append(exp.column(alias or col_expr))
                else:
                    short_prop = prop_path.split(".", 1)[1]
                    outer_projections.append(exp.column(short_prop))
            else:
                norm = self._normalize_expr_sql(sql_expr)
                alias = alias_map.get(norm)
                outer_projections.append(exp.column(alias or sql_expr))
                if alias:
                    self.columns[prop_path] = alias

        for col in self.required_columns:
            outer_projections.append(exp.column(col))

        # Build query with CTE if needed
        if alias_map:
            cte_projections = [
                exp.alias_(occurrences[n]["orig"], alias) for n, alias in alias_map.items()
            ]

            base_model = exp.Subquery(this=base_sql_expr).as_("base_model")
            precomputed_select = exp.Select().select("*", *cte_projections).from_(base_model)

            query = (
                exp.Select()
                .select(*outer_projections)
                .from_("precomputed")
                .with_("precomputed", as_=precomputed_select)
            )
        else:
            base_model = exp.Subquery(this=base_sql_expr).as_("base_model")
            query = exp.Select().select(*outer_projections).from_(base_model)

        # Static filters
        static_filters = []
        for interaction in self.insight.interactions or []:
            if interaction.filter:
                filter_expr = interaction.filter.get_value()
                if filter_expr:
                    static_filters.append(
                        parse_expression(filter_expr, dialect=self.sqlglot_dialect)
                    )
                    if self._is_dynamic(filter_expr):
                        self.is_dynamic_interactions = True

        if static_filters:
            query = query.where(*static_filters)

        # Group by
        if self.groupby_statements:
            mapped_groupbys = []
            for g in self.groupby_statements:
                norm_g = self._normalize_expr_sql(g)
                mapped_groupbys.append(exp.column(alias_map.get(norm_g, g)))
            query = query.group_by(*mapped_groupbys)

        # Static sorts (safe unwrap)
        static_sorts = []
        for interaction in self.insight.interactions or []:
            if interaction.sort:
                sort_expr = interaction.sort.get_value()
                if sort_expr:
                    parsed_sort = parse_expression(sort_expr, dialect=self.sqlglot_dialect)
                    if isinstance(parsed_sort, exp.Alias):
                        parsed_sort = parsed_sort.this
                    static_sorts.append(parsed_sort)
                    if self._is_dynamic(sort_expr):
                        self.is_dynamic_interactions = True
        if static_sorts:
            query = query.order_by(*static_sorts)

        return query.sql(dialect=self.sqlglot_dialect, pretty=True)

    def _generate_post_query(self) -> str:
        """Generate client-side query with dynamic filters/sorts"""
        if self.is_dynamic_interactions:
            return self.model.sql
        return parse_expression(f"SELECT * FROM '{self.insight.name}'", dialect="duckdb").sql()

    def _parameterize_input_references(self, expr: str) -> str:
        """Replace ${ref(input).value} with parameter placeholders"""
        return expr

    def _serialize_interactions(self) -> List[Dict[str, Any]]:
        """Convert interactions to serializable format"""
        if not self.insight.interactions:
            return []

        result = []
        for interaction in self.insight.interactions:
            interaction_dict = {}

            if interaction.filter:
                filter_expr = interaction.filter.get_value()
                if filter_expr:
                    interaction_dict["filter"] = self.parse_duckdb(filter_expr)

            if interaction.split:
                split_expr = interaction.split.get_value()
                if split_expr:
                    interaction_dict["split"] = split_expr

            if interaction.sort:
                sort_expr = interaction.sort.get_value()
                if sort_expr:
                    interaction_dict["sort"] = self.parse_duckdb(sort_expr)

            if interaction_dict:
                result.append(interaction_dict)

        return result

    def _get_split_column(self) -> Optional[str]:
        """Get the column used for splitting data into multiple traces"""
        if self.insight.interactions:
            for interaction in self.insight.interactions:
                if interaction.split:
                    return interaction.split.get_value()
        return None

    def _get_sort_expressions(self) -> Optional[List[str]]:
        """Get sort expressions for client-side ordering"""
        sort_exprs = []
        if self.insight.interactions:
            for interaction in self.insight.interactions:
                if interaction.sort:
                    sort_expr = interaction.sort.get_value()
                    if sort_expr:
                        sort_exprs.append(sort_expr)
        return sort_exprs if sort_exprs else None

    def _normalize_expr_sql(self, sql_expr: str) -> str:
        """
        Return a canonical form of an expression using sqlglot.
        If parsing fails, fall back to the stripped original.
        """
        if sql_expr is None:
            return ""
        s = str(sql_expr).strip()
        try:
            parsed = parse_expression(s, dialect=self.sqlglot_dialect)
            return parsed.sql(dialect=self.sqlglot_dialect, normalize=True)
        except Exception:
            return re.sub(r"\s+", " ", s).strip()

    def _make_alias_name(
        self, preferred: Optional[str], used: Set[str], prefix: str = "expr"
    ) -> str:
        """
        Create a safe alias name (no collisions with used).
        If preferred is given and not used, choose that (sanitized).
        """

        def sanitize(name: str) -> str:
            return re.sub(r"[^\w]", "_", name)

        if preferred:
            cand = sanitize(preferred)
            if cand not in used and not cand.isdigit():
                used.add(cand)
                return cand

        i = 0
        while True:
            cand = f"{prefix}_{i}"
            if cand not in used:
                used.add(cand)
                return cand
            i += 1

    def _is_dynamic(self, expr: str) -> bool:
        """
        Checks if an interaction uses dynamic inputs via ref(...).
            Example: {"filter": "?{ sales_amount > 1000 AND region = ${ref(sales-region)} }"}
        """
        DYNAMIC_PATTERN = re.compile(r"\$\{\s*ref\([^)]+\)\s*\}", re.IGNORECASE)
        return bool(DYNAMIC_PATTERN.search(expr))
