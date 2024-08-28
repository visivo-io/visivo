import re
from typing import List, Optional
from visivo.models.alert import AlertField, Alert

from visivo.models.include import Include
from visivo.models.models.model import Model
from visivo.models.models.fields import ModelField
from visivo.models.models.sql_model import SqlModel
from visivo.models.selector import Selector, SelectorType
from visivo.models.sources.fields import SourceField


from .base.parent_model import ParentModel
from .dashboard import Dashboard
from .chart import Chart
from .trace import Trace
from .sources.source import Source
from .table import Table
from .defaults import Defaults
from typing import List
from .base.named_model import NamedModel
from .base.base_model import BaseModel
from pydantic import ConfigDict, Field, model_validator


class Project(NamedModel, ParentModel):
    model_config = ConfigDict(populate_by_name=True)

    defaults: Optional[Defaults] = None
    cli_version: Optional[str] = None
    includes: List[Include] = []
    alerts: List[AlertField] = []
    sources: List[SourceField] = Field(
        [],
        description="A list of source objects.",
        alias="targets",
    )
    models: List[ModelField] = []
    traces: List[Trace] = []
    tables: List[Table] = []
    charts: List[Chart] = []
    selectors: List[Selector] = []
    dashboards: List[Dashboard] = []

    def child_items(self):
        return (
            self.alerts
            + self.sources
            + self.models
            + self.traces
            + self.tables
            + self.charts
            + self.selectors
            + self.dashboards
        )

    @property
    def trace_objs(self) -> List[Trace]:
        return list(filter(Trace.is_obj, self.__all_traces()))

    @property
    def trace_refs(self) -> List[str]:
        return list(filter(Trace.is_ref, self.__all_traces()))

    @property
    def chart_objs(self) -> List[Chart]:
        return list(filter(Chart.is_obj, self.__all_charts()))

    @property
    def chart_refs(self) -> List[str]:
        return list(filter(Chart.is_ref, self.__all_charts()))

    @property
    def table_objs(self) -> List[Chart]:
        return list(filter(Table.is_obj, self.__all_tables()))

    @property
    def model_objs(self) -> List[Model]:
        return list(filter(Model.is_obj, self.__all_models()))

    @property
    def source_objs(self) -> List[Source]:
        return list(filter(Source.is_obj, self.__all_sources()))

    def filter_traces(self, name_filter) -> List[Trace]:
        if name_filter:
            included_nodes = self.nodes_including_named_node_in_graph(name=name_filter)
        else:
            included_nodes = self.descendants()
        return set(self.descendants_of_type(Trace)).intersection(included_nodes)

    def find_source(self, name: str) -> Source:
        return next((t for t in self.source_objs if t.name == name), None)

    def find_chart(self, name: str) -> Chart:
        return next((c for c in self.chart_objs if c.name == name), None)

    def find_table(self, name: str) -> Chart:
        return next((t for t in self.table_objs if t.name == name), None)

    def find_alert(self, name: str) -> Alert:
        return next((a for a in self.alerts if a.name == name), None)

    @model_validator(mode="after")
    def validate_default_names(self):
        sources, alerts = (self.sources, self.alerts)
        source_names = [source.name for source in sources]
        alert_names = [alert.name for alert in alerts]
        defaults = self.defaults
        if not defaults:
            return self

        if defaults.source_name and defaults.source_name not in source_names:
            raise ValueError(f"default source '{defaults.source_name}' does not exist")

        if defaults.alert_name and defaults.alert_name not in alert_names:
            raise ValueError(f"default alert '{defaults.alert_name}' does not exist")

        return self

    @model_validator(mode="after")
    def validate_models_have_sources(self):
        defaults = self.defaults
        if defaults and defaults.source_name:
            return self

        for model in self.model_objs:
            if isinstance(model, SqlModel) and not model.source:
                raise ValueError(
                    f"'{model.name}' does not specify a source and project does not specify default source"
                )

        return self

    @model_validator(mode="after")
    def validate_dag(self):
        dag = self.dag()
        tables = ParentModel.all_descendants_of_type(
            type=Table, dag=dag, from_node=self
        )
        for table in tables:
            selector = ParentModel.all_descendants_of_type(
                type=Selector, dag=dag, from_node=table
            )[0]
            if selector.type == SelectorType.multiple:
                raise ValueError(
                    f"Table with name '{table.name}' has a selector with a 'multiple' type.  This is not permitted."
                )

        return self

    @model_validator(mode="after")
    def validate_names(self):
        Project.traverse_names([], self)
        return self

    @classmethod
    def traverse_names(cls, names, object):
        if isinstance(object, ParentModel):
            for child_item in object.child_items():
                if isinstance(child_item, BaseModel) and hasattr(child_item, "name"):
                    name = NamedModel.get_name(obj=child_item)
                    if name in names:
                        raise ValueError(
                            f"{child_item.__class__.__name__} name '{name}' is not unique in the project"
                        )
                    if name:
                        names.append(name)
                Project.traverse_names(names, child_item)

    def __all_traces(self):
        traces = []
        traces += self.traces
        for table in self.tables:
            traces += table.traces
        for chart in self.charts:
            traces += chart.traces
        for dashboard in self.dashboards:
            traces += dashboard.all_traces
        return traces

    def __all_models(self):
        models = []
        models += self.models
        for trace in self.trace_objs:
            models += [trace.model]
        return models

    def __all_charts(self):
        charts = []
        charts += self.charts
        for dashboard in self.dashboards:
            charts += dashboard.all_charts
        return charts

    def __all_tables(self):
        tables = []
        tables += self.tables
        for dashboard in self.dashboards:
            tables += dashboard.all_tables
        return tables

    def __all_sources(self):
        sources = []
        sources += self.sources
        for model in self.model_objs:
            if model.source:
                sources += [model.source]
        return sources
