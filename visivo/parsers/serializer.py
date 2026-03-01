from visivo.logger.logger import Logger
from visivo.models.dag import all_descendants, all_descendants_of_type
from visivo.models.inputs.input import Input
from visivo.models.insight import Insight
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
        self._dag = None

    def _get_dag(self):
        """Get cached DAG."""
        if self._dag is None:
            self._dag = self.project.dag()
        return self._dag

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
        all_insights = []
        all_charts = []
        all_tables = []
        all_selectors = []
        all_inputs = []

        # Process all objects in the DAG
        for node in dag.nodes():
            if isinstance(node, Source):
                all_sources.append(node.model_dump(exclude_none=True, mode="json"))
            elif isinstance(node, Model):
                all_models.append(node.model_dump(exclude_none=True, mode="json"))
            elif isinstance(node, Trace):
                all_traces.append(node.model_dump(exclude_none=True, mode="json"))
            elif isinstance(node, Insight):
                all_insights.append(node.model_dump(exclude_none=True, mode="json"))
            elif isinstance(node, Chart):
                all_charts.append(node.model_dump(exclude_none=True, mode="json"))
            elif isinstance(node, Table):
                all_tables.append(node.model_dump(exclude_none=True, mode="json"))
            elif isinstance(node, Selector):
                all_selectors.append(node.model_dump(exclude_none=True, mode="json"))
            elif isinstance(node, Input):
                all_inputs.append(node.model_dump(exclude_none=True, mode="json"))

        # Create the flattened structure
        flattened = {
            "name": project.name,
            "cli_version": project.cli_version,
            "sources": all_sources,
            "models": all_models,
            "traces": all_traces,
            "insights": all_insights,
            "charts": all_charts,
            "tables": all_tables,
            "selectors": all_selectors,
            "inputs": all_inputs,
        }

        # Add default source name if it exists
        if project.defaults and project.defaults.source_name:
            flattened["default_source"] = project.defaults.source_name

        return flattened

    def dereference_to_dict(self) -> dict:
        """
        Creates a dereferenced version of the project as a dict without deep copying.
        This is more efficient than dereference() + model_dump_json() for large projects.
        """
        project = self.project
        dag = self._get_dag()

        # Build dashboards with dereferenced items
        dashboards = []
        for dashboard in project.dashboards:
            dashboard_dict = dashboard.model_dump(exclude_none=True, mode="json")
            # Process rows and items to inline refs
            for row_dict in dashboard_dict.get("rows", []):
                for item_dict in row_dict.get("items", []):
                    self._dereference_item_dict(item_dict, dashboard, dag)
            dashboards.append(dashboard_dict)

        # Build the output dict with empty top-level collections
        return {
            "name": project.name,
            "cli_version": VISIVO_VERSION,
            "dashboards": dashboards,
            "charts": [],
            "traces": [],
            "insights": [],
            "tables": [],
            "models": [],
            "sources": [],
            "selectors": [],
            "inputs": [],
        }

    def _dereference_item_dict(self, item_dict, dashboard, dag):
        """Recursively dereference an item dict by finding the actual item and inlining refs."""
        # Find the actual item object from the dashboard
        item_name = item_dict.get("name")
        if not item_name:
            return

        # Find the item in the dashboard
        actual_item = None
        for row in dashboard.rows:
            for item in row.items:
                if item.name == item_name:
                    actual_item = item
                    break
            if actual_item:
                break

        if not actual_item:
            return

        # Handle chart
        if actual_item.chart or (isinstance(item_dict.get("chart"), str)):
            chart = all_descendants_of_type(type=Chart, dag=dag, from_node=actual_item)
            if chart:
                chart = chart[0]
                chart_dict = chart.model_dump(exclude_none=True, mode="json")

                # Inline traces
                traces = all_descendants_of_type(type=Trace, dag=dag, from_node=chart, depth=1)
                chart_dict["traces"] = [self._dereference_trace_dict(t, dag) for t in traces]

                # Inline insights
                insights = all_descendants_of_type(type=Insight, dag=dag, from_node=chart, depth=1)
                chart_dict["insights"] = [
                    i.model_dump(exclude_none=True, mode="json") for i in insights
                ]

                # Inline selector
                if chart.selector:
                    selectors = all_descendants_of_type(
                        type=Selector, dag=dag, from_node=chart, depth=1
                    )
                    if selectors:
                        selector = selectors[0]
                        selector_dict = selector.model_dump(exclude_none=True, mode="json")
                        options = all_descendants_of_type(
                            type=Trace, dag=dag, from_node=selector, depth=1
                        )
                        selector_dict["options"] = [
                            self._dereference_trace_dict(t, dag) for t in options
                        ]
                        chart_dict["selector"] = selector_dict

                item_dict["chart"] = chart_dict

        # Handle table
        if actual_item.table or (isinstance(item_dict.get("table"), str)):
            table = all_descendants_of_type(type=Table, dag=dag, from_node=actual_item)
            if table:
                table = table[0]
                table_dict = table.model_dump(exclude_none=True, mode="json")

                # Inline traces
                traces = all_descendants_of_type(type=Trace, dag=dag, from_node=table, depth=1)
                table_dict["traces"] = [self._dereference_trace_dict(t, dag) for t in traces]

                # Inline insights
                insights = all_descendants_of_type(type=Insight, dag=dag, from_node=table, depth=1)
                table_dict["insights"] = [
                    i.model_dump(exclude_none=True, mode="json") for i in insights
                ]

                # Inline selector
                if table.selector:
                    selectors = all_descendants_of_type(
                        type=Selector, dag=dag, from_node=table, depth=1
                    )
                    if selectors:
                        selector = selectors[0]
                        selector_dict = selector.model_dump(exclude_none=True, mode="json")
                        options = all_descendants_of_type(
                            type=Trace, dag=dag, from_node=selector, depth=1
                        )
                        selector_dict["options"] = [
                            self._dereference_trace_dict(t, dag) for t in options
                        ]
                        table_dict["selector"] = selector_dict

                item_dict["table"] = table_dict

        # Handle item-level selector
        if actual_item.selector or (isinstance(item_dict.get("selector"), str)):
            selectors = all_descendants_of_type(
                type=Selector, dag=dag, from_node=actual_item, depth=1
            )
            if selectors:
                selector = selectors[0]
                selector_dict = selector.model_dump(exclude_none=True, mode="json")
                options = [
                    opt
                    for opt in all_descendants(dag=dag, from_node=selector, depth=1)
                    if not isinstance(opt, Selector)
                ]
                selector_dict["options"] = [
                    opt.model_dump(exclude_none=True, mode="json") for opt in options
                ]
                item_dict["selector"] = selector_dict

        # Handle input
        if actual_item.input or (isinstance(item_dict.get("input"), str)):
            inputs = all_descendants_of_type(type=Input, dag=dag, from_node=actual_item, depth=1)
            if inputs:
                item_dict["input"] = inputs[0].model_dump(exclude_none=True, mode="json")

    def _dereference_trace_dict(self, trace, dag) -> dict:
        """Create a dereferenced trace dict with model and source inlined."""
        trace_dict = trace.model_dump(exclude_none=True, mode="json")

        # Inline model
        models = all_descendants_of_type(type=Model, dag=dag, from_node=trace)
        if models:
            model = models[0]
            model_dict = model.model_dump(exclude_none=True, mode="json")

            # Inline source if present
            if hasattr(model, "source"):
                sources = all_descendants_of_type(type=Source, dag=dag, from_node=model)
                if sources:
                    model_dict["source"] = sources[0].model_dump(exclude_none=True, mode="json")

            # Inline nested models if present
            if hasattr(model, "models") and model.models:
                nested_models = all_descendants_of_type(type=Model, dag=dag, from_node=model)
                model_dict["models"] = [
                    m.model_dump(exclude_none=True, mode="json") for m in nested_models
                ]

            trace_dict["model"] = model_dict

        return trace_dict

    def dereference(self) -> Project:
        project = self.project.model_copy(deep=True)
        project.cli_version = VISIVO_VERSION
        # Invalidate DAG cache since the deep copy created new object instances
        project.invalidate_dag_cache()
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
                    component.insights = all_descendants_of_type(
                        type=Insight, dag=dag, from_node=component, depth=1
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

                    # Insights no longer have a direct model field
                    # Model references are now embedded in props using ${ref(model).field} syntax
                    for insight in component.insights:
                        pass  # No model resolution needed

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

                if item.input:
                    item.input = all_descendants_of_type(
                        type=Input, dag=dag, from_node=item, depth=1
                    )[0]

            dashboard.for_each_item(replace_item_ref)

        project.charts = []
        project.traces = []
        project.insights = []
        project.tables = []
        project.models = []
        project.sources = []
        project.selectors = []
        project.inputs = []
        return project
