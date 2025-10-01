import re
from typing import Dict, List, Set, Any, Optional
from sqlglot import exp

from visivo.models.base.project_dag import ProjectDag
from visivo.models.insight import Insight
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

    def __init__(self, insight: Insight, model: Model, source: Source, dag: ProjectDag):
        self.insight = insight
        self.source = source
        self.model = model
        self.dag = dag
        self.project = dag.get_project()
        self.source_type = source.type
        self.sqlglot_dialect = get_sqlglot_dialect(source.get_dialect()) if source.type else None
        self.statement_classifier = StatementClassifier(source_type=self.source_type)

        # Semantic layer resolvers (lazy-loaded)
        self._metric_resolver = None
        self._dimension_resolver = None
        self.referenced_models = set()  # Track models referenced via ${ref(model).field}

        self.select_items = {}
        self.selects = {}
        self.columns = {}
        self.interaction_dependencies = {}
        self.input_dependencies = set()
        self.required_columns = set()
        self.groupby_statements = set()
        self.is_dynamic_interactions = False

        self._analyze_insight()

    def _get_metric_resolver(self):
        """Lazily initialize and return the MetricResolver."""
        if self._metric_resolver is None and self.project is not None:
            from visivo.query.resolvers.metric_resolver import MetricResolver

            self._metric_resolver = MetricResolver(self.project)
        return self._metric_resolver

    def _get_dimension_resolver(self):
        """Lazily initialize and return the DimensionResolver."""
        if self._dimension_resolver is None and self.project is not None:
            from visivo.query.resolvers.dimension_resolver import DimensionResolver

            self._dimension_resolver = DimensionResolver(self.project)
        return self._dimension_resolver

    def _resolve_metric_reference(self, query_statement: str) -> str:
        """
        Resolve metric and dimension references in query statements.
        Converts ${ref(model).metric_name} or ${ref(metric_name)} to the actual metric expression.
        Converts ${ref(model).dimension_name} or ${ref(dimension_name)} to the actual dimension expression.
        Also handles ${ref(model).field} for cross-model field references.
        Supports both single-model metrics/dimensions and compositions.
        """
        # First try to use MetricResolver if project is available
        if self.project is not None:
            resolver = self._get_metric_resolver()
            if resolver:
                # Pattern to match ${ref(metric_name)} for metric-to-metric references
                simple_metric_pattern = r"\$\{\s*ref\(\s*([^.)]+)\s*\)\s*\}"

                def replace_simple_metric(match):
                    metric_name = match.group(1).strip().strip("\"'")

                    # Check if this is actually a metric (not a model)
                    if metric_name in resolver.metrics_by_name:
                        try:
                            # Resolve the metric expression (handles compositions)
                            resolved_expr = resolver.resolve_metric_expression(metric_name)

                            # Track models used in this metric (excluding current model)
                            metric_models = resolver.get_models_from_metric(metric_name)
                            # Only add models that are not the current model
                            other_models = metric_models - {self.model.name}
                            self.referenced_models.update(other_models)

                            return f"({resolved_expr})"
                        except Exception:
                            # If resolution fails, fall back to original
                            pass

                    # Not a metric reference, return original
                    return match.group(0)

                # First resolve simple metric references
                query_statement = re.sub(
                    simple_metric_pattern, replace_simple_metric, query_statement
                )

            # Now try dimension resolution
            dimension_resolver = self._get_dimension_resolver()
            if dimension_resolver:
                # Pattern to match ${ref(dimension_name)} for dimension references
                simple_dimension_pattern = r"\$\{\s*ref\(\s*([^.)]+)\s*\)\s*\}"

                def replace_simple_dimension(match):
                    dimension_name = match.group(1).strip().strip("\"'")

                    # Skip if this was already handled as a metric
                    if resolver and dimension_name in resolver.metrics_by_name:
                        return match.group(0)

                    # Try to resolve as a dimension
                    try:
                        resolved_expr = dimension_resolver.resolve_dimension_expression(
                            dimension_name, current_model=self.model.name
                        )

                        # Track models used in this dimension
                        dimension_models = dimension_resolver.get_models_from_dimension(
                            dimension_name
                        )
                        # Only add models that are not the current model
                        other_models = dimension_models - {self.model.name}
                        self.referenced_models.update(other_models)

                        return f"({resolved_expr})"
                    except Exception:
                        # Not a dimension, return original
                        return match.group(0)

                # Resolve simple dimension references
                query_statement = re.sub(
                    simple_dimension_pattern, replace_simple_dimension, query_statement
                )

        # Pattern to match ${ref(model_name).field_or_metric_name}
        from visivo.query.patterns import METRIC_REF_PATTERN

        def replace_ref(match):
            model_name = match.group(1).strip().strip("\"'")
            field_or_metric_name = match.group(2).strip() if match.group(2) else None

            if not field_or_metric_name:
                return match.group(0)

            # Track referenced model
            if model_name != self.model.name:
                self.referenced_models.add(model_name)

            # Try to resolve with metric resolver first if available
            if self.project is not None:
                resolver = self._get_metric_resolver()
                if resolver:
                    qualified_name = f"{model_name}.{field_or_metric_name}"
                    if qualified_name in resolver.metrics_by_name:
                        try:
                            resolved_expr = resolver.resolve_metric_expression(qualified_name)
                            return f"({resolved_expr})"
                        except Exception:
                            pass

                # Try dimension resolver
                dimension_resolver = self._get_dimension_resolver()
                if dimension_resolver:
                    try:
                        resolved_expr = dimension_resolver.resolve_dimension_expression(
                            field_or_metric_name, current_model=model_name
                        )
                        return f"({resolved_expr})"
                    except Exception:
                        pass

            # Fall back to simple field reference
            # If this is the current model, don't use table prefix
            # (we're selecting from the model's SQL result, not a table)
            if model_name == self.model.name:
                return field_or_metric_name
            else:
                # For other models, use table-qualified reference
                # (will need JOIN support to work properly)
                return f"{model_name}.{field_or_metric_name}"

        return re.sub(METRIC_REF_PATTERN, replace_ref, query_statement)

    def tokenize(self) -> TokenizedInsight:
        pre_query = self._generate_pre_query()
        post_query = self._generate_post_query()

        if self.is_dynamic_interactions:
            pre_query, post_query = post_query, pre_query

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
            selects=self.selects,
            columns=self.columns,
            props=props,
            interactions=self._serialize_interactions(),
            input_dependencies=list(self.input_dependencies),
            requires_groupby=len(self.groupby_statements) > 0,
            groupby_statements=list(self.groupby_statements) if self.groupby_statements else None,
            split_column=self._get_split_column(),
            sort_expressions=self._get_sort_expressions(),
        )

    def _analyze_insight(self):
        self._analyze_props()
        self._analyze_interactions()
        self._determine_groupby_requirements()

    def _analyze_props(self):
        self._extract_select_items(self.insight.props, ["props"])

    def _extract_select_items(self, obj: Any, path: List[str]):
        if obj is None:
            return

        if isinstance(obj, (InsightProps, Layout)):
            props_dict = obj.model_dump()
            for key, value in props_dict.items():
                if value is not None:
                    self._extract_select_items(value, path + [key])

        elif isinstance(obj, BaseModel):
            for prop in obj.__class__.model_fields.keys():
                prop_value = getattr(obj, prop, None)
                if prop_value is not None:
                    self._extract_select_items(prop_value, path + [prop])

        elif isinstance(obj, list):
            for i, value in enumerate(obj):
                self._extract_select_items(value, path + [str(i)])

        elif isinstance(obj, dict):
            for key, value in obj.items():
                self._extract_select_items(value, path + [key])

        else:
            query_id = ".".join(path)

            sql_expression = None
            if path[0] == "props":
                expression = QueryString(obj).get_value()
                if expression:
                    # Apply semantic layer resolution to the expression
                    sql_expression = self._resolve_metric_reference(expression)

            if sql_expression and query_id not in ("filter", "order_by"):
                self.select_items[query_id] = sql_expression

                self._analyze_sql_expression(sql_expression)

    def _analyze_interactions(self):
        if not self.insight.interactions:
            return

        for interaction in self.insight.interactions:
            interaction_deps = set()

            if interaction.filter:
                filter_expr = interaction.filter.get_value()
                if filter_expr:
                    # Apply semantic layer resolution to filter expressions
                    resolved_filter = self._resolve_metric_reference(filter_expr)
                    interaction_deps.update(resolved_filter)
                    columns = self._extract_column_dependencies(resolved_filter)
                    self.required_columns.update(columns)

            if interaction.split:
                split_expr = interaction.split.get_value()
                if split_expr:
                    # Apply semantic layer resolution to split expressions
                    resolved_split = self._resolve_metric_reference(split_expr)
                    columns = self._extract_column_dependencies(resolved_split)
                    self.required_columns.update(columns)

            if interaction.sort:
                sort_expr = interaction.sort.get_value()
                if sort_expr:
                    # Apply semantic layer resolution to sort expressions
                    resolved_sort = self._resolve_metric_reference(sort_expr)
                    columns = self._extract_column_dependencies(resolved_sort)
                    self.required_columns.update(columns)

    def _analyze_sql_expression(self, sql_expr: str):
        try:
            parsed = parse_expression(sql_expr, dialect=self.sqlglot_dialect)

            if has_aggregate_function(parsed):
                non_aggregated_cols = find_non_aggregated_columns(parsed)
                self.groupby_statements.update(non_aggregated_cols)

        except Exception as e:
            Logger.instance().debug(f"SQLglot parsing failed for '{sql_expr}': {e}")
            self._fallback_aggregation_analysis(sql_expr)

    def _fallback_aggregation_analysis(self, sql_expr: str):
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
                    if not self._is_inside_function(sql_expr, match):
                        self.groupby_statements.add(match)

    def _is_inside_function(self, sql_expr: str, column: str) -> bool:
        import re

        pattern = rf"\w+\([^)]*\b{re.escape(column)}\b[^)]*\)"
        return bool(re.search(pattern, sql_expr, re.IGNORECASE))

    def _extract_column_dependencies(self, sql_expr: str) -> List[str]:
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

        has_any_aggregation = False
        all_referenced_columns = set()

        for expr in list(self.select_items.values()):
            try:
                parsed = parse_expression(expr, dialect=self.sqlglot_dialect)
            except Exception:
                parsed = None

            if parsed and has_aggregate_function(parsed):
                has_any_aggregation = True
                # For aggregations, find columns that are NOT inside aggregate functions
                non_agg_cols = find_non_aggregated_columns(parsed)
                all_referenced_columns.update(non_agg_cols)
            else:
                # For non-aggregations, add the entire expression to GROUP BY
                # This handles cases like date_trunc('month', order_date)
                all_referenced_columns.add(expr)

        if has_any_aggregation:
            derived_targets = set()

            for column in all_referenced_columns.union(self.required_columns):
                if column not in derived_targets and not self._is_column_inside_aggregation(column):
                    self.groupby_statements.add(column)

    def _is_column_inside_aggregation(self, column: str) -> bool:
        for expr in list(self.select_items.values()):
            if column.lower() in expr.lower():
                if not self._is_inside_function(expr, column):
                    return False
        return True

    def _generate_pre_query(self) -> str:
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

        for prop_path, sql_expr in self.select_items.items():
            short_prop = prop_path.split(".", 1)[1]
            register(sql_expr, "prop", prop_path, preferred_alias=short_prop)

        for req in list(self.required_columns or []):
            register(req, "required", req, preferred_alias=req)

        alias_map, used_aliases = {}, set()
        for norm, info in occurrences.items():
            force_alias = "(" in info["orig"] or ")" in info["orig"] or " " in info["orig"]
            if info["count"] > 1 or force_alias:
                preferred_alias = None
                if info["preferred_aliases"]:
                    preferred_alias = sorted(info["preferred_aliases"], key=len)[0]
                alias = self._make_alias_name(preferred_alias, used_aliases, prefix="expr")
                alias_map[norm] = alias

        outer_projections = []
        for prop_path, sql_expr in self.select_items.items():
            norm = self._normalize_expr_sql(sql_expr)
            alias = alias_map.get(norm)
            outer_projections.append(exp.column(alias or sql_expr))
            if alias:
                self.columns[prop_path] = alias

        for col in self.required_columns:
            outer_projections.append(exp.column(col))

        if alias_map:
            cte_projections = [
                exp.alias_(occurrences[n]["orig"], alias) for n, alias in alias_map.items()
            ]

            base_model = exp.Subquery(this=base_sql_expr).as_("base_model")

            # When we have GROUP BY, we can't SELECT *, we need to explicitly select only grouped columns
            if self.groupby_statements:
                # Select only the columns that will be grouped by
                # Parse each groupby statement as an expression (not just a column name)
                grouped_columns = []
                for g in self.groupby_statements:
                    parsed_expr = parse_expression(g, self.sqlglot_dialect)
                    if parsed_expr:
                        grouped_columns.append(parsed_expr)
                    else:
                        # Fallback to treating it as a column name
                        grouped_columns.append(exp.column(g))

                precomputed_select = (
                    exp.Select().select(*grouped_columns, *cte_projections).from_(base_model)
                )

                # Add GROUP BY to the CTE (where aggregations are)
                precomputed_select = precomputed_select.group_by(*grouped_columns)
            else:
                # No GROUP BY needed, can use SELECT *
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

            # Add GROUP BY to simple query if needed
            if self.groupby_statements:
                mapped_groupbys = []
                for g in self.groupby_statements:
                    parsed_expr = parse_expression(g, self.sqlglot_dialect)
                    if parsed_expr:
                        mapped_groupbys.append(parsed_expr)
                    else:
                        # Fallback to treating it as a column name
                        mapped_groupbys.append(exp.column(g))
                query = query.group_by(*mapped_groupbys)

        static_filters = []
        for interaction in self.insight.interactions or []:
            if interaction.filter:
                filter_expr = interaction.filter.get_value()
                if filter_expr:
                    # Apply semantic layer resolution to filter expressions
                    resolved_filter = self._resolve_metric_reference(filter_expr)
                    static_filters.append(
                        parse_expression(resolved_filter, dialect=self.sqlglot_dialect)
                    )
                    if self._is_dynamic(filter_expr):
                        self.is_dynamic_interactions = True
        if static_filters:
            query = query.where(*static_filters)

        static_sorts = []
        for interaction in self.insight.interactions or []:
            if interaction.sort:
                sort_expr = interaction.sort.get_value()
                if sort_expr:
                    # Apply semantic layer resolution to sort expressions
                    resolved_sort = self._resolve_metric_reference(sort_expr)
                    parsed_sort = parse_expression(resolved_sort, dialect=self.sqlglot_dialect)
                    if isinstance(parsed_sort, exp.Alias):
                        parsed_sort = parsed_sort.this
                    static_sorts.append(parsed_sort)
                    if self._is_dynamic(sort_expr):
                        self.is_dynamic_interactions = True
        if static_sorts:
            query = query.order_by(*static_sorts)

        return query.sql(dialect=self.sqlglot_dialect, pretty=True)

    def _generate_post_query(self) -> str:

        return self.model.sql

    def _parameterize_input_references(self, expr: str) -> str:
        return expr

    def _serialize_interactions(self) -> List[Dict[str, Any]]:
        if not self.insight.interactions:
            return []

        result = []
        for interaction in self.insight.interactions:
            interaction_dict = {}

            if interaction.filter:
                filter_expr = interaction.filter.get_value()
                if filter_expr:
                    # Store the resolved filter expression
                    interaction_dict["filter"] = self._resolve_metric_reference(filter_expr)

            if interaction.split:
                split_expr = interaction.split.get_value()
                if split_expr:
                    # Store the resolved split expression
                    interaction_dict["split"] = self._resolve_metric_reference(split_expr)

            if interaction.sort:
                sort_expr = interaction.sort.get_value()
                if sort_expr:
                    # Store the resolved sort expression
                    interaction_dict["sort"] = self._resolve_metric_reference(sort_expr)

            if interaction_dict:
                result.append(interaction_dict)

        return result

    def _get_split_column(self) -> Optional[str]:
        if self.insight.interactions:
            for interaction in self.insight.interactions:
                if interaction.split:
                    split_expr = interaction.split.get_value()
                    # Apply semantic layer resolution
                    return self._resolve_metric_reference(split_expr) if split_expr else None
        return None

    def _get_sort_expressions(self) -> Optional[List[str]]:
        sort_exprs = []
        if self.insight.interactions:
            for interaction in self.insight.interactions:
                if interaction.sort:
                    sort_expr = interaction.sort.get_value()
                    if sort_expr:
                        # Apply semantic layer resolution
                        resolved_sort = self._resolve_metric_reference(sort_expr)
                        sort_exprs.append(resolved_sort)
        return sort_exprs if sort_exprs else None

    def _normalize_expr_sql(self, sql_expr: str) -> str:
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
        DYNAMIC_PATTERN = re.compile(r"\$\{\s*ref\([^)]+\)\s*\}", re.IGNORECASE)
        return bool(DYNAMIC_PATTERN.search(expr))
