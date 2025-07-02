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
from visivo.query.sql_validator import (
    validate_and_classify_trace_sql,
    classify_expression,
    extract_groupby_expressions,
    get_sqlglot_dialect,
)
from visivo.utils import extract_value_from_function
import warnings
import re

DEFAULT_COHORT_ON = "'values'"


class TraceTokenizer:
    def __init__(self, trace: Trace, model: Model, source: Source):
        self.trace = trace
        self.source = source
        self.model = model

        # Validate and parse the main SQL query using SQLGlot
        try:
            self.parsed_ast, self.query_classification, self.sqlglot_dialect = (
                validate_and_classify_trace_sql(self.model.sql, source.type)
            )
        except ValueError as e:
            # Re-raise with context about which trace failed
            raise ValueError(f"Invalid SQL in trace '{trace.name}': {e}")

        self.select_items = {}
        self._set_select_items()
        self._set_order_by()
        self._set_groupby()
        self._set_filter()

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
        return TokenizedTrace(**data)

    def _get_cohort_on(self):
        """Enables passing query tag to cohort on or just passing the column name as is"""
        cohort_on = self.trace.cohort_on
        if self.trace.name:
            cohort_on = cohort_on or f"'{self.trace.name}'"
        cohort_on = cohort_on or DEFAULT_COHORT_ON
        # TODO Replace with query string
        de_query = extract_value_from_function(cohort_on, "query")
        return de_query if de_query else cohort_on

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
                self.select_items.update({query_id: query_statement})

    def _set_groupby(self):
        # Use SQLGlot AST to determine which expressions need GROUP BY
        if self.query_classification in ("aggregate", "window"):
            # Extract groupby expressions from the main query AST
            groupby_from_ast = extract_groupby_expressions(self.parsed_ast, self.sqlglot_dialect)
        else:
            # For vanilla queries, start with empty list from main query
            groupby_from_ast = []

        # Always check individual select_items and order_by for expressions that need groupby
        additional_groupby = []
        has_aggregate_items = False

        # Process individual select_items - check if any contain aggregates
        for statement in self.select_items.values():
            if not re.findall(r"^\s*'.*'\s*$", statement):
                classification = classify_expression(statement, self.sqlglot_dialect)
                if classification == "aggregate":
                    has_aggregate_items = True
                elif classification in ("vanilla", "window"):
                    additional_groupby.append(statement)

        # Process order_by expressions
        if hasattr(self, "order_by"):
            for statement in self.order_by:
                # Clean order by statement (remove ASC/DESC)
                statement_lower = statement.lower()
                statement_clean = statement_lower.replace("asc", "").replace("desc", "").strip()

                # Skip literal strings
                if not re.findall(r"^\s*'.*'\s*$", statement_clean):
                    classification = classify_expression(statement_clean, self.sqlglot_dialect)
                    if classification == "aggregate":
                        has_aggregate_items = True
                    elif classification == "vanilla":
                        additional_groupby.append(statement_clean)
                    elif classification == "window":
                        # Window functions in order_by should also be added to groupby_statements
                        # for compatibility with existing behavior
                        has_aggregate_items = True  # Treat as needing groupby
                        additional_groupby.append(statement_clean)

        # Process cohort_on if it's not a literal
        cohort_on = self._get_cohort_on()
        if not re.findall(r"^\s*'.*'\s*$", cohort_on):
            classification = classify_expression(cohort_on, self.sqlglot_dialect)
            if classification == "aggregate":
                has_aggregate_items = True
            elif classification in ("vanilla", "window"):
                additional_groupby.append(cohort_on)

        # Check if template will generate a GROUP BY clause
        will_have_groupby = cohort_on != "'values'"

        # Set groupby statements if we have aggregates, main query has aggregates,
        # or if the template will generate a GROUP BY clause due to cohort_on
        if (
            self.query_classification in ("aggregate", "window")
            or has_aggregate_items
            or will_have_groupby
        ):
            # Combine and deduplicate
            all_groupby = groupby_from_ast + additional_groupby
            if all_groupby:
                # Deduplicate while preserving order
                unique_groupby = []
                seen = set()
                for expr in all_groupby:
                    if expr not in seen:
                        unique_groupby.append(expr)
                        seen.add(expr)
                self.groupby_statements = unique_groupby
            else:
                self.groupby_statements = []
        else:
            # Pure vanilla query with no aggregates and cohort_on is 'values'
            self.groupby_statements = []

    def _set_filter(self):
        trace_dict = self.trace.model_dump()
        filters = trace_dict.get("filters")
        if filters:
            filter_by = {"aggregate": [], "window": [], "vanilla": []}
            for filter in filters:
                argument = extract_value_from_function(filter, "query")
                # Use SQLGlot-based classification
                classification = classify_expression(argument, self.sqlglot_dialect)

                if classification == "window":
                    filter_by["window"].append(argument)
                elif classification == "vanilla":
                    filter_by["vanilla"].append(argument)
                elif classification == "aggregate":
                    filter_by["aggregate"].append(argument)

            # Apply Snowflake-specific window function filtering rule
            if self.source.type != "snowflake":
                if filter_by["window"]:
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
                    parsed_order_by.append(argument)
            if parsed_order_by:
                self.order_by = parsed_order_by
