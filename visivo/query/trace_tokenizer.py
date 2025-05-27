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
from .dialect import Dialect
from .statement_classifier import StatementClassifier, StatementEnum
from ..utils import extract_value_from_function
import warnings
import re

DEFAULT_COHORT_ON = "'values'"


class TraceTokenizer:
    def __init__(self, trace: Trace, model: Model, source: Source):
        self.trace = trace
        self.source = source
        self.model = model
        self.dialect = Dialect(type=source.type)
        self.statement_classifier = StatementClassifier(dialect=self.dialect)
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
            for prop in obj.model_fields.keys():
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
                statement_lower = statement.lower()
                statement_clean = statement_lower.replace("asc", "").replace("desc", "").strip()
                order_by.append(statement_clean)
        else:
            order_by = []
        query_statements = list(self.select_items.values()) + order_by + [self._get_cohort_on()]
        groupby = []
        for statement in query_statements:
            if re.findall(r"^\s*'.*'\s*$", statement):
                continue
            classification = self.statement_classifier.classify(statement)
            match classification:
                case StatementEnum.window:
                    groupby.append(statement)
                case StatementEnum.vanilla:
                    groupby.append(statement)

        if groupby:
            self.groupby_statements = list(set(groupby))

    def _set_filter(self):
        trace_dict = self.trace.model_dump()
        filters = trace_dict.get("filters")
        if filters:
            filter_by = {"aggregate": [], "window": [], "vanilla": []}
            for filter in filters:
                argument = extract_value_from_function(filter, "query")
                classification = self.statement_classifier.classify(argument)
                match classification:
                    case StatementEnum.window:
                        filter_by["window"].append(argument)
                    case StatementEnum.vanilla:
                        filter_by["vanilla"].append(argument)
                    case StatementEnum.aggregate:
                        filter_by["aggregate"].append(argument)
            if str(self.dialect.type) != "snowflake":
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
