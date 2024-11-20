import re
from typing import List, Optional
from visivo.models.alert import Alert
from visivo.models.dag import all_descendants_of_type
from visivo.models.destinations.destination import Destination

from visivo.models.destinations.fields import DestinationField
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
from .dbt import Dbt
from typing import List
from .base.named_model import NamedModel
from .base.base_model import BaseModel
from pydantic import ConfigDict, Field, model_validator


class Project(NamedModel, ParentModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    defaults: Optional[Defaults] = None
    dbt: Optional[Dbt] = None
    cli_version: Optional[str] = None
    includes: List[Include] = []
    destinations: List[DestinationField] = []
    alerts: List[Alert] = []
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
            self.destinations
            + self.alerts
            + self.sources
            + self.models
            + self.traces
            + self.tables
            + self.charts
            + self.selectors
            + self.dashboards
        )

    def filter_traces(self, name_filter) -> List[Trace]:
        if name_filter:
            included_nodes = self.nodes_including_named_node_in_graph(name=name_filter)
        else:
            included_nodes = self.descendants()
        return set(self.descendants_of_type(Trace)).intersection(included_nodes)

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

        for model in self.descendants_of_type(Model):
            if isinstance(model, SqlModel) and not model.source:
                raise ValueError(
                    f"'{model.name}' does not specify a source and project does not specify default source"
                )

        return self

    @model_validator(mode="after")
    def validate_dag(self):
        dag = self.dag()
        tables = all_descendants_of_type(type=Table, dag=dag, from_node=self)
        for table in tables:
            selectors = all_descendants_of_type(type=Selector, dag=dag, from_node=table)
            if len(selectors) > 0 and selectors[0].type == SelectorType.multiple:
                raise ValueError(
                    f"Table with name '{table.name}' has a selector with a 'multiple' type.  This is not permitted."
                )

        return self

    @model_validator(mode="before")
    def set_paths_on_models(cls, values):
        def set_path_recursively(obj, path=""):
            if isinstance(obj, dict):
                obj["path"] = path
                for key, value in obj.items():
                    if key not in ["props", "defaults", "layout", "columns"]:
                        new_path = f"{path}.{key}" if path else key
                        set_path_recursively(value, new_path)
            elif isinstance(obj, list):
                for index, item in enumerate(obj):
                    new_path = f"{path}[{index}]"
                    set_path_recursively(item, new_path)

        set_path_recursively(values, "project")
        return values

    @model_validator(mode="after")
    def validate_names(self):
        Project.traverse_names([], self)
        return self

    @model_validator(mode="before")
    def set_path_on_named_models(cls, values):
        def set_path_recursively(obj, path=""):
            if isinstance(obj, dict):
                obj["path"] = path
                for key, value in obj.items():
                    if key not in ["props", "defaults", "layout", "columns"]:
                        new_path = f"{path}.{key}" if path else key
                        set_path_recursively(value, new_path)
            elif isinstance(obj, list):
                for index, item in enumerate(obj):
                    new_path = f"{path}[{index}]"
                    set_path_recursively(item, new_path)

        set_path_recursively(values, "project")
        return values

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
