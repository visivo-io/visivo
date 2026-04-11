from visivo.logger.logger import Logger
from visivo.models.dag import all_descendants, all_descendants_of_type
from visivo.models.inputs.input import Input
from visivo.models.insight import Insight
from visivo.models.selector import Selector
from visivo.models.sources.source import Source
from visivo.models.project import Project
from visivo.models.chart import Chart
from visivo.models.table import Table
from visivo.models.models.model import Model
from visivo.version import VISIVO_VERSION


class Serializer:
    def __init__(self, project: Project):
        self.project = project
        self._dag = None

    def _get_dag(self):
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

        all_sources = []
        all_models = []
        all_insights = []
        all_charts = []
        all_tables = []
        all_selectors = []
        all_inputs = []

        for node in dag.nodes():
            if isinstance(node, Source):
                all_sources.append(node.model_dump(exclude_none=True, mode="json"))
            elif isinstance(node, Model):
                all_models.append(node.model_dump(exclude_none=True, mode="json"))
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

        flattened = {
            "name": project.name,
            "cli_version": project.cli_version,
            "sources": all_sources,
            "models": all_models,
            "insights": all_insights,
            "charts": all_charts,
            "tables": all_tables,
            "selectors": all_selectors,
            "inputs": all_inputs,
        }

        if project.defaults and project.defaults.source_name:
            flattened["default_source"] = project.defaults.source_name

        return flattened

    def dereference_to_dict(self) -> dict:
        """
        Creates a dereferenced version of the project as a dict without deep copying.
        """
        project = self.project
        dag = self._get_dag()

        dashboards = []
        for dashboard in project.dashboards:
            dashboard_dict = dashboard.model_dump(exclude_none=True, mode="json")
            for row_dict in dashboard_dict.get("rows", []):
                for item_dict in row_dict.get("items", []):
                    self._dereference_item_dict(item_dict, dashboard, dag)
            dashboards.append(dashboard_dict)

        return {
            "name": project.name,
            "cli_version": VISIVO_VERSION,
            "dashboards": dashboards,
            "charts": [],
            "insights": [],
            "tables": [],
            "models": [],
            "sources": [],
            "selectors": [],
            "inputs": [],
        }

    def _dereference_item_dict(self, item_dict, dashboard, dag):
        item_name = item_dict.get("name")
        if not item_name:
            return

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

        if actual_item.chart or (isinstance(item_dict.get("chart"), str)):
            chart = all_descendants_of_type(type=Chart, dag=dag, from_node=actual_item)
            if chart:
                chart = chart[0]
                chart_dict = chart.model_dump(exclude_none=True, mode="json")

                insights = all_descendants_of_type(type=Insight, dag=dag, from_node=chart, depth=1)
                chart_dict["insights"] = [
                    i.model_dump(exclude_none=True, mode="json") for i in insights
                ]

                if chart.selector:
                    selectors = all_descendants_of_type(
                        type=Selector, dag=dag, from_node=chart, depth=1
                    )
                    if selectors:
                        selector = selectors[0]
                        selector_dict = selector.model_dump(exclude_none=True, mode="json")
                        chart_dict["selector"] = selector_dict

                item_dict["chart"] = chart_dict

        if actual_item.table or (isinstance(item_dict.get("table"), str)):
            table = all_descendants_of_type(type=Table, dag=dag, from_node=actual_item)
            if table:
                table = table[0]
                table_dict = table.model_dump(exclude_none=True, mode="json")

                if table.data:
                    insights = all_descendants_of_type(
                        type=Insight, dag=dag, from_node=table, depth=1
                    )
                    if insights:
                        table_dict["data"] = insights[0].model_dump(exclude_none=True, mode="json")
                    else:
                        models = all_descendants_of_type(
                            type=Model, dag=dag, from_node=table, depth=1
                        )
                        if models:
                            table_dict["data"] = models[0].model_dump(
                                exclude_none=True, mode="json"
                            )

                if table.selector:
                    selectors = all_descendants_of_type(
                        type=Selector, dag=dag, from_node=table, depth=1
                    )
                    if selectors:
                        selector = selectors[0]
                        selector_dict = selector.model_dump(exclude_none=True, mode="json")
                        table_dict["selector"] = selector_dict

                item_dict["table"] = table_dict

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

        if actual_item.input or (isinstance(item_dict.get("input"), str)):
            inputs = all_descendants_of_type(type=Input, dag=dag, from_node=actual_item, depth=1)
            if inputs:
                item_dict["input"] = inputs[0].model_dump(exclude_none=True, mode="json")

    def dereference(self) -> Project:
        project = self.project.model_copy(deep=True)
        project.cli_version = VISIVO_VERSION
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

                    resolved_insights = all_descendants_of_type(
                        type=Insight, dag=dag, from_node=component, depth=1
                    )
                    if hasattr(component, "insights"):
                        component.insights = resolved_insights
                    if hasattr(component, "data") and component.data and resolved_insights:
                        component.data = resolved_insights[0]
                    elif hasattr(component, "data") and component.data:
                        resolved_models = all_descendants_of_type(
                            type=Model, dag=dag, from_node=component, depth=1
                        )
                        if resolved_models:
                            component.data = resolved_models[0]
                    if component.selector:
                        component.selector = all_descendants_of_type(
                            type=Selector, dag=dag, from_node=component, depth=1
                        )[0]

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
        project.insights = []
        project.tables = []
        project.models = []
        project.sources = []
        project.selectors = []
        project.inputs = []
        return project
