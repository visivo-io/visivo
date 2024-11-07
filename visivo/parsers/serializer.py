from visivo.models.dag import all_descendants, all_descendants_of_type
from visivo.models.selector import Selector
from visivo.models.sources.source import Source
from ..models.project import Project
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
                        item.chart = all_descendants_of_type(
                            type=Chart, dag=dag, from_node=item
                        )[0]
                        component = item.chart
                    else:
                        item.table = all_descendants_of_type(
                            type=Table, dag=dag, from_node=item
                        )[0]
                        component = item.table

                    component.traces = all_descendants_of_type(
                        type=Trace, dag=dag, from_node=component, depth=1
                    )
                    if component.selector:
                        component.selector = all_descendants_of_type(
                            type=Selector, dag=dag, from_node=component, depth=1
                        )[0]
                        component.selector.options = all_descendants_of_type(
                            type=Trace,
                            dag=dag,
                            from_node=component.selector,
                            depth=1,
                        )
                    for trace in component.traces:
                        trace.model = all_descendants_of_type(
                            type=Model, dag=dag, from_node=trace
                        )[0]
                        if hasattr(trace.model, "source"):
                            trace.model.source = all_descendants_of_type(
                                type=Source, dag=dag, from_node=trace.model
                            )[0]
                        if hasattr(trace.model, "models"):
                            trace.model.models = all_descendants_of_type(
                                type=Model, dag=dag, from_node=trace.model
                            )
                if item.selector:
                    item.selector = all_descendants_of_type(
                        type=Selector, dag=dag, from_node=item, depth=1
                    )[0]
                    options = [
                        option
                        for option in all_descendants(
                            dag=dag, from_node=item.selector, depth=1
                        )
                        if not isinstance(option, Selector)
                    ]
                    item.selector.options = options

            dashboard.for_each_item(replace_item_ref)

        project.charts = []
        project.traces = []
        project.tables = []
        project.models = []
        project.sources = []
        project.selectors = []
        return project
