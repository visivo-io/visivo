from visivo.models.base.named_model import NamedModel
from visivo.models.selector import Selector
from visivo.models.targets.target import Target
from ..models.project import Project
from ..models.base.base_model import BaseModel
from ..models.base.parent_model import ParentModel
from visivo.models.chart import Chart
from visivo.models.table import Table
from visivo.models.trace import Trace
from visivo.models.models.model import Model
from importlib.metadata import version


class Serializer:
    def __init__(self, project: Project):
        self.project = project

    def dereference(self) -> Project:
        project = self.project.model_copy(deep=True)
        project.cli_version = version("visivo")
        dag = project.dag()
        for dashboard in project.dashboards:

            def replace_item_ref(item):
                if item.chart or item.table:
                    if item.chart:
                        item.chart = ParentModel.all_descendants_of_type(
                            type=Chart, dag=dag, from_node=item
                        )[0]
                        component = item.chart
                    else:
                        item.table = ParentModel.all_descendants_of_type(
                            type=Table, dag=dag, from_node=item
                        )[0]
                        component = item.table

                    component.traces = ParentModel.all_descendants_of_type(
                        type=Trace, dag=dag, from_node=component
                    )
                    component.selector = ParentModel.all_descendants_of_type(
                        type=Selector, dag=dag, from_node=component
                    )[0]
                    for trace in component.traces:
                        trace.model = ParentModel.all_descendants_of_type(
                            type=Model, dag=dag, from_node=trace
                        )[0]
                        if hasattr(trace.model, "target"):
                            trace.model.target = ParentModel.all_descendants_of_type(
                                type=Target, dag=dag, from_node=trace.model
                            )[0]
                        if hasattr(trace.model, "models"):
                            trace.model.models = ParentModel.all_descendants_of_type(
                                type=Model, dag=dag, from_node=trace.model
                            )

            dashboard.for_each_item(replace_item_ref)

        project.charts = []
        project.traces = []
        project.tables = []
        project.models = []
        project.targets = []
        return project
