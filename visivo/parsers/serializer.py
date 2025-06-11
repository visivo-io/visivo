from visivo.models.dag import all_descendants, all_descendants_of_type
from visivo.models.selector import Selector
from visivo.models.sources.source import Source
from visivo.models.project import Project
from visivo.models.chart import Chart
from visivo.models.table import Table
from visivo.models.trace import Trace
from visivo.models.models.model import Model
from visivo.version import VISIVO_VERSION


class Serializer:
    def __init__(self, project: Project):
        self.project = project

    def create_flattened_project(self) -> dict:
        """
        Creates a flattened version of the project where all objects are at the top level
        and nested objects are replaced with references.
        """
        project = self.project
        dag = project.dag()

        # Collect all objects
        all_sources = []
        all_models = []
        all_traces = []
        all_charts = []
        all_tables = []
        all_selectors = []

        # Process all objects in the DAG
        for node in dag.nodes():
            if isinstance(node, Source):
                all_sources.append(node.model_dump(exclude_none=True, mode="json"))
            elif isinstance(node, Model):
                all_models.append(node.model_dump(exclude_none=True, mode="json"))
            elif isinstance(node, Trace):
                all_traces.append(node.model_dump(exclude_none=True, mode="json"))
            elif isinstance(node, Chart):
                all_charts.append(node.model_dump(exclude_none=True, mode="json"))
            elif isinstance(node, Table):
                all_tables.append(node.model_dump(exclude_none=True, mode="json"))
            elif isinstance(node, Selector):
                all_selectors.append(node.model_dump(exclude_none=True, mode="json"))

        # Create the flattened structure
        flattened = {
            "name": project.name,
            "cli_version": project.cli_version,
            "sources": all_sources,
            "models": all_models,
            "traces": all_traces,
            "charts": all_charts,
            "tables": all_tables,
            "selectors": all_selectors,
        }

        # Add default source name if it exists
        if project.defaults and project.defaults.source_name:
            flattened["default_source"] = project.defaults.source_name

        return flattened

    def dereference(self) -> Project:
        project = self.project.model_copy(deep=True)
        project.cli_version = VISIVO_VERSION
        dag = project.dag()

        for dashboard in project.dashboards:

            def replace_item_ref(item):
                if item.chart or item.table:
                    if item.chart:
                        item.chart = all_descendants_of_type(type=Chart, dag=dag, from_node=item)[0]
                        component = item.chart
                    else:
                        item.table = all_descendants_of_type(type=Table, dag=dag, from_node=item)[0]
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
                        trace.model = all_descendants_of_type(type=Model, dag=dag, from_node=trace)[
                            0
                        ]
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
                        for option in all_descendants(dag=dag, from_node=item.selector, depth=1)
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
