from visivo.models.base.base_model import BaseModel
from visivo.models.base.query_string import QueryString
from visivo.models.trace import Trace
from visivo.models.sources.source import Source
from visivo.models.models.model import Model
from visivo.models.models.local_merge_model import LocalMergeModel
from visivo.models.tokenized_trace import TokenizedTrace
from visivo.models.trace_columns import TraceColumns
from visivo.models.trace_props.layout import Layout
from visivo.models.trace_props.trace_props import TraceProps
from visivo.query.statement_classifier import StatementClassifier, StatementEnum
from visivo.query.sqlglot_utils import (
    parse_expression,
    find_non_aggregated_columns,
    get_sqlglot_dialect,
)
import re
import sqlglot
from visivo.utils import extract_value_from_function
from typing import Optional
import warnings

DEFAULT_COHORT_ON = "'values'"


class TraceTokenizer:
    def __init__(self, trace: Trace, model: Model, source: Source, project=None):
        self.trace = trace
        self.source = source
        self.model = model
        self.project = project  # Optional project for metric resolution
        self.source_type = source.type
        self.sqlglot_dialect = get_sqlglot_dialect(source.type) if source.type else None
        self.statement_classifier = StatementClassifier(source_type=source.type)
        self.select_items = {}
        self._metric_resolver = None  # Will be initialized lazily if needed
        self._dimension_resolver = None  # Will be initialized lazily if needed
        self.referenced_models = set()  # Track models referenced via ${ref(model).field}
        self._set_select_items()
        self._set_order_by()
        self._set_groupby()
        self._set_filter()

    def _get_metric_resolver(self):
        """Lazily initialize and return the MetricResolver."""
        if self._metric_resolver is None and self.project is not None:
            from visivo.query.metric_resolver import MetricResolver

            self._metric_resolver = MetricResolver(self.project)
        return self._metric_resolver

    def _get_dimension_resolver(self):
        """Lazily initialize and return the DimensionResolver."""
        if self._dimension_resolver is None and self.project is not None:
            from visivo.query.dimension_resolver import DimensionResolver

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
                # Note: This is intentionally different from METRIC_REF_PATTERN as it only
                # matches simple metric references WITHOUT a dot/field (e.g., ${ref(revenue)})
                # to distinguish from model.field references (e.g., ${ref(orders).revenue})
                simple_metric_pattern = r"\$\{\s*ref\(\s*([^.)]+)\s*\)\s*\}"

                def replace_simple_metric(match):
                    metric_name = match.group(1).strip().strip("'\"")

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
                # Same pattern as metrics but we'll check dimensions
                simple_dimension_pattern = r"\$\{\s*ref\(\s*([^.)]+)\s*\)\s*\}"

                def replace_simple_dimension(match):
                    dimension_name = match.group(1).strip().strip("'\"")

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
        from visivo.models.base.context_string import METRIC_REF_PATTERN

        def replace_ref(match):
            model_name = match.group(1).strip().strip("'\"")
            field_or_metric_name = match.group(2).strip() if match.group(2) else None

            # If there's no field_or_metric_name, this matches ${ref(something)}
            # which should already be handled by the simple_metric_pattern above
            # So we return the original match unchanged
            if field_or_metric_name is None:
                return match.group(0)

            # Try to resolve as a metric first
            if self.project is not None:
                resolver = self._get_metric_resolver()
                if resolver:
                    # Try to find the metric in the resolver's index
                    full_metric_name = f"{model_name}.{field_or_metric_name}"
                    if full_metric_name in resolver.metrics_by_name:
                        try:
                            resolved_expr = resolver.resolve_metric_expression(full_metric_name)

                            # Track models used in this metric (excluding current model)
                            metric_models = resolver.get_models_from_metric(full_metric_name)
                            # Only add models that are not the current model
                            other_models = metric_models - {self.model.name}
                            self.referenced_models.update(other_models)

                            return f"({resolved_expr})"
                        except Exception:
                            pass

                    # Try just the metric name
                    if field_or_metric_name in resolver.metrics_by_name:
                        try:
                            resolved_expr = resolver.resolve_metric_expression(field_or_metric_name)

                            # Track models used in this metric (excluding current model)
                            metric_models = resolver.get_models_from_metric(field_or_metric_name)
                            # Only add models that are not the current model
                            other_models = metric_models - {self.model.name}
                            self.referenced_models.update(other_models)

                            return f"({resolved_expr})"
                        except Exception:
                            pass

                # Try to resolve as a dimension if metric resolution failed
                dimension_resolver = self._get_dimension_resolver()
                if dimension_resolver:
                    # Try qualified dimension name
                    full_dimension_name = f"{model_name}.{field_or_metric_name}"
                    try:
                        resolved_expr = dimension_resolver.resolve_dimension_expression(
                            full_dimension_name, current_model=self.model.name
                        )

                        # Track models used in this dimension
                        dimension_models = dimension_resolver.get_models_from_dimension(
                            full_dimension_name
                        )
                        # Only add models that are not the current model
                        other_models = dimension_models - {self.model.name}
                        self.referenced_models.update(other_models)

                        return f"({resolved_expr})"
                    except Exception:
                        pass

                    # Try just the dimension name
                    try:
                        resolved_expr = dimension_resolver.resolve_dimension_expression(
                            field_or_metric_name, current_model=self.model.name
                        )

                        # Track models used in this dimension
                        dimension_models = dimension_resolver.get_models_from_dimension(
                            field_or_metric_name
                        )
                        # Only add models that are not the current model
                        other_models = dimension_models - {self.model.name}
                        self.referenced_models.update(other_models)

                        return f"({resolved_expr})"
                    except Exception:
                        pass

            # Check if it's a metric in the current model (backward compatibility)
            if model_name == self.model.name:
                # Look for the metric in the model's metrics
                if hasattr(self.model, "metrics") and self.model.metrics:
                    for metric in self.model.metrics:
                        if metric.name == field_or_metric_name:
                            # For backward compatibility, resolve the metric here too
                            # and track any models it references
                            if self.project is not None and resolver:
                                try:
                                    # Track models used in this metric (excluding current model)
                                    metric_models = resolver.get_models_from_metric(
                                        field_or_metric_name
                                    )
                                    # Only add models that are not the current model
                                    other_models = metric_models - {self.model.name}
                                    self.referenced_models.update(other_models)
                                except Exception:
                                    pass

                            # Return the metric expression wrapped in parentheses for safety
                            return f"({metric.expression})"

                # Look for the dimension in the model's dimensions
                if hasattr(self.model, "dimensions") and self.model.dimensions:
                    for dimension in self.model.dimensions:
                        if dimension.name == field_or_metric_name:
                            # For backward compatibility, resolve the dimension here too
                            dimension_resolver = self._get_dimension_resolver()
                            if self.project is not None and dimension_resolver:
                                try:
                                    # Track models used in this dimension
                                    dimension_models = dimension_resolver.get_models_from_dimension(
                                        field_or_metric_name
                                    )
                                    # Only add models that are not the current model
                                    other_models = dimension_models - {self.model.name}
                                    self.referenced_models.update(other_models)
                                except Exception:
                                    pass

                            # Return the dimension expression wrapped in parentheses for safety
                            expression = (
                                dimension.expression if dimension.expression else dimension.name
                            )
                            return f"({expression})"

                # If it's the current model and not a metric or dimension, leave it unchanged
                # This preserves backward compatibility and error messages
                return match.group(0)

            # If it's a different model, this is a cross-model field reference
            # Track that we're referencing this model
            self.referenced_models.add(model_name)

            # For cross-model fields, we need to qualify with the model name
            # This will be used later for join generation
            return f"{model_name}.{field_or_metric_name}"

        # Replace all references
        resolved = re.sub(METRIC_REF_PATTERN, replace_ref, query_statement)
        return resolved

    def tokenize(self):
        cohort_on = self._get_cohort_on()
        if isinstance(self.model, LocalMergeModel):
            source_type = "duckdb"
        elif self.source.type:
            source_type = self.source.type
        else:
            source_type = None
        data = {
            "sql": self.model.sql,
            "cohort_on": cohort_on,
            "select_items": self.select_items,
            "source": self.source.name,
            "source_type": source_type,
        }
        if hasattr(self, "groupby_statements"):
            data.update({"groupby_statements": self.groupby_statements})
        if hasattr(self, "order_by"):
            data.update({"order_by": self.order_by})
        if hasattr(self, "filter_by"):
            data.update({"filter_by": self.filter_by})
        if self.referenced_models:
            data.update({"referenced_models": list(self.referenced_models)})
        return TokenizedTrace(**data)

    def _get_cohort_on(self):
        """Enables passing query tag to cohort on or just passing the column name as is"""
        cohort_on = self.trace.cohort_on
        if self.trace.name:
            cohort_on = cohort_on or f"'{self.trace.name}'"
        cohort_on = cohort_on or DEFAULT_COHORT_ON
        # TODO Replace with query string
        de_query = extract_value_from_function(cohort_on, "query")
        cohort_on_value = de_query if de_query else cohort_on

        # Resolve any metric or dimension references in cohort_on
        cohort_on_value = self._resolve_metric_reference(cohort_on_value)

        # For Redshift, cast string literals to VARCHAR(128) to avoid type conversion issues
        if self.source.type == "redshift":
            # Check if it's a string literal (starts and ends with single quotes)
            if re.match(r"^'.*'$", cohort_on_value.strip()):
                cohort_on_value = f"CAST({cohort_on_value} AS VARCHAR(128))"

        return cohort_on_value

    def _set_select_items(self, obj=None, path=[]):
        if obj == None:
            obj = self.trace
        if isinstance(obj, TraceProps) or isinstance(obj, Layout):
            # Get all fields including extra ones from the model dump
            trace_props_dict = obj.model_dump()
            for key, value in trace_props_dict.items():
                if value is not None:
                    self._set_select_items(value, path + [key])
        elif isinstance(obj, BaseModel):
            for prop in obj.__class__.model_fields.keys():
                prop_value = getattr(obj, prop, None)
                if prop_value != None:
                    self._set_select_items(prop_value, path + [prop])
        elif isinstance(obj, TraceColumns):
            for key in obj.model_dump().keys():
                prop_value = getattr(obj, key, None)
                if prop_value != None:
                    self._set_select_items(prop_value, path + [key])
        # TODO: Add support for lists of query statements.
        elif isinstance(obj, list):
            for i, value in enumerate(obj):
                self._set_select_items(value, path + [i])
        elif isinstance(obj, dict):
            for key, value in obj.items():
                self._set_select_items(value, path + [key])
        else:
            query_id = ".".join([str(i) for i in path])
            query_statement = False
            if path[0] == "props":
                query_statement = extract_value_from_function(obj, "query")
            if path[0] == "columns":
                if isinstance(obj, QueryString):
                    query_statement = obj.get_value()
                else:
                    query_statement = str(obj)

            if query_statement and query_id not in ("cohort_on", "filter", "order_by"):
                # Resolve any metric references in the query statement
                resolved_statement = self._resolve_metric_reference(query_statement)
                self.select_items.update({query_id: resolved_statement})

    def _set_groupby(self):
        if hasattr(self, "order_by"):
            order_by = []
            for statement in self.order_by:
                # Remove ASC/DESC from order by statements for groupby
                expr = parse_expression(statement, self.sqlglot_dialect)
                if expr:
                    # Remove order direction if present
                    if isinstance(expr, sqlglot.exp.Ordered):
                        order_by.append(expr.this.sql())
                    else:
                        statement_clean = (
                            statement.lower().replace("asc", "").replace("desc", "").strip()
                        )
                        order_by.append(statement_clean)
                else:
                    statement_clean = (
                        statement.lower().replace("asc", "").replace("desc", "").strip()
                    )
                    order_by.append(statement_clean)
        else:
            order_by = []

        query_statements = list(self.select_items.values()) + order_by + [self._get_cohort_on()]
        groupby = set()

        for statement in query_statements:
            # Skip literal strings
            if statement.strip().startswith("'") and statement.strip().endswith("'"):
                continue

            # Parse and find non-aggregated columns
            expr = parse_expression(statement, self.sqlglot_dialect)
            if expr:
                # Get all non-aggregated columns from this expression
                non_agg_columns = find_non_aggregated_columns(expr)
                if non_agg_columns:
                    # Add the entire expression if it contains non-aggregated columns
                    # and is not itself an aggregate
                    classification = self.statement_classifier.classify(statement)
                    if classification != StatementEnum.aggregate:
                        groupby.add(statement)
            else:
                # Fallback to classification-based approach
                classification = self.statement_classifier.classify(statement)
                if classification in [StatementEnum.window, StatementEnum.vanilla]:
                    groupby.add(statement)

        if groupby:
            self.groupby_statements = list(groupby)

    def _set_filter(self):
        trace_dict = self.trace.model_dump()
        filters = trace_dict.get("filters")
        if filters:
            filter_by = {"aggregate": [], "window": [], "vanilla": []}
            for filter in filters:
                argument = extract_value_from_function(filter, "query")
                # Resolve metric references in filters
                resolved_argument = self._resolve_metric_reference(argument)
                classification = self.statement_classifier.classify(resolved_argument)
                if classification == StatementEnum.window:
                    filter_by["window"].append(resolved_argument)
                elif classification == StatementEnum.vanilla:
                    filter_by["vanilla"].append(resolved_argument)
                elif classification == StatementEnum.aggregate:
                    filter_by["aggregate"].append(resolved_argument)
            if self.source_type != "snowflake":
                if filter_by["window"] != []:
                    warnings.warn(
                        "Window function filtering is only supported on snowflake sources",
                        Warning,
                    )
                filter_by["window"] = []
            self.filter_by = filter_by

    def _set_order_by(self):
        trace_dict = self.trace.model_dump()
        order_by = trace_dict.get("order_by")
        if order_by:
            parsed_order_by = []
            for statement in order_by:
                argument = extract_value_from_function(statement, "query")
                if argument:
                    # Resolve metric references in order_by
                    resolved_argument = self._resolve_metric_reference(argument)
                    parsed_order_by.append(resolved_argument)
            if parsed_order_by:
                self.order_by = parsed_order_by
