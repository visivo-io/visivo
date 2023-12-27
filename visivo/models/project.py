import re
from typing import Any, List, Optional, Union

from visivo.models.include import Include


from .base.parent_model import ParentModel
from .dashboard import Dashboard
from .chart import Chart
from .trace import Trace
from .target import Target
from .table import Table
from .model import Model
from .alert import EmailAlert, SlackAlert, ConsoleAlert
from .defaults import Defaults
from typing import List
from .base.named_model import NamedModel
from .base.base_model import BaseModel
from pydantic import model_validator, Field
from typing_extensions import Annotated

Alert = Annotated[
    Union[SlackAlert, EmailAlert, ConsoleAlert], Field(discriminator="type")
]


class Project(NamedModel, ParentModel):
    defaults: Optional[Defaults] = None
    includes: List[Include] = []
    alerts: List[Alert] = []
    targets: List[Target] = []
    models: List[Model] = []
    traces: List[Trace] = []
    tables: List[Table] = []
    charts: List[Chart] = []
    dashboards: List[Dashboard] = []

    def child_items(self):
        return (
            self.alerts
            + self.targets
            + self.models
            + self.traces
            + self.tables
            + self.charts
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

    def filter_traces(self, pattern) -> List[Trace]:
        def name_match(trace):
            return re.search(pattern, trace.name)

        return list(filter(name_match, self.trace_objs))

    def find_target(self, name: str) -> Target:
        return next((t for t in self.targets if t.name == name), None)

    def find_chart(self, name: str) -> Chart:
        return next((c for c in self.chart_objs if c.name == name), None)

    def find_table(self, name: str) -> Chart:
        return next((t for t in self.table_objs if t.name == name), None)

    def find_alert(self, name: str) -> Alert:
        return next((a for a in self.alerts if a.name == name), None)

    @model_validator(mode="before")
    @classmethod
    def validate_default_names(cls, data: Any):
        defaults = data.get("defaults")
        if not defaults:
            return data

        targets, alerts = (data.get("targets"), data.get("alerts"))
        if not targets:
            targets = []
        if not alerts:
            alerts = []
        target_names = [target.get("name") for target in targets]
        alert_names = [alert.get("name") for alert in alerts]

        if (
            defaults.get("target_name")
            and defaults.get("target_name") not in target_names
        ):
            raise ValueError(
                f"default target '{defaults.get('target_name')}' does not exist"
            )

        if defaults.get("alert_name") and defaults.get("alert_name") not in alert_names:
            raise ValueError(
                f"default alert '{defaults.get('alert_name')}' does not exist"
            )

        return data

    @model_validator(mode="after")
    def validate_dag(self):
        self.dag()
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
            traces += [table.trace]
        for chart in self.charts:
            traces += chart.traces
        for dashboard in self.dashboards:
            traces += dashboard.all_traces
        return traces

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
