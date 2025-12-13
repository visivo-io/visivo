from visivo.logger.logger import Logger
from visivo.models.base.base_model import BaseModel
from visivo.models.base.query_string import QueryString
from visivo.models.props.layout import Layout
from visivo.models.props.trace_props import TraceProps
from visivo.models.trace import Trace
from visivo.models.sources.source import Source
from visivo.models.models.model import Model
from visivo.models.models.local_merge_model import LocalMergeModel
from visivo.models.tokenized_trace import TokenizedTrace
from visivo.models.trace_columns import TraceColumns
from visivo.query.statement_classifier import StatementClassifier, StatementEnum
from visivo.query.sqlglot_utils import (
    parse_expression,
    find_non_aggregated_expressions,
    get_sqlglot_dialect,
)
import re
import sqlglot
from visivo.utils import extract_value_from_function
import warnings

DEFAULT_COHORT_ON = "'values'"


class TraceTokenizer:
    def __init__(self, trace: Trace, model: Model, source: Source):
        self.trace = trace
        self.source = source
        self.model = model
        self.source_type = source.type
        self.sqlglot_dialect = get_sqlglot_dialect(source.get_dialect()) if source.type else None
        self.statement_classifier = StatementClassifier(source_type=source.type)
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
            "dialect": self.sqlglot_dialect,
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
        cohort_on_value = de_query if de_query else cohort_on

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
                self.select_items.update({query_id: query_statement})

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
                non_agg_columns = find_non_aggregated_expressions(expr)
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
                classification = self.statement_classifier.classify(argument)
                if classification == StatementEnum.window:
                    filter_by["window"].append(argument)
                elif classification == StatementEnum.vanilla:
                    filter_by["vanilla"].append(argument)
                elif classification == StatementEnum.aggregate:
                    filter_by["aggregate"].append(argument)
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
                    parsed_order_by.append(argument)
            if parsed_order_by:
                self.order_by = parsed_order_by
