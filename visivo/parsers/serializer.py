from visivo.models.dag import all_descendants_of_type
from visivo.models.inputs.input import Input
from visivo.models.insight import Insight
from visivo.models.sources.source import Source
from visivo.models.project import Project
from visivo.models.chart import Chart
from visivo.models.table import Table
from visivo.models.models.model import Model
from visivo.models.models.sql_model import SqlModel
from visivo.models.models.csv_script_model import CsvScriptModel
from visivo.models.models.local_merge_model import LocalMergeModel
from visivo.models.dimension import Dimension
from visivo.models.metric import Metric
from visivo.models.relation import Relation
from visivo.models.markdown import Markdown
from visivo.version import VISIVO_VERSION


class Serializer:
    def __init__(self, project: Project):
        self.project = project
        self._dag = None

    def _get_dag(self):
        if self._dag is None:
            self._dag = self.project.dag()
        return self._dag

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

                item_dict["table"] = table_dict

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
        project.inputs = []
        return project

    def collect_deploy_resources(self) -> dict:
        """Collect every named object the decomposed deploy posts, keyed by the
        cloud endpoint segment (``/api/<segment>/``).

        A deploy decomposes the project into per-type POSTs instead of one
        ``project_json`` blob. This emits each named object — with
        ``${ref(...)}`` references preserved by ``model_dump`` — so the cloud
        editor + lineage see the authored config, identical to what the object
        managers serve in ``visivo serve`` for the local editor (they read this
        same DAG).

        Model subtypes are split (sql / csv-script / local-merge) to match the
        cloud's separate per-type endpoints. Dimensions and metrics are
        surfaced even when authored inside a model, since they are their own
        named nodes in the DAG. Charts/insights/tables/markdowns/inputs are
        emitted in source (ref) form — distinct from the baked, inlined copies
        carried on the dashboards for rendering.
        """
        dag = self._get_dag()

        def collect(node_type):
            collected = []
            seen = set()
            for node in all_descendants_of_type(type=node_type, dag=dag):
                name = getattr(node, "name", None)
                if name and name not in seen:
                    seen.add(name)
                    collected.append(node.model_dump(exclude_none=True, mode="json"))
            return collected

        return {
            "sources": collect(Source),
            "models": collect(SqlModel),
            "csv-script-models": collect(CsvScriptModel),
            "local-merge-models": collect(LocalMergeModel),
            "dimensions": collect(Dimension),
            "metrics": collect(Metric),
            "relations": collect(Relation),
            "charts": collect(Chart),
            "insights": collect(Insight),
            "tables": collect(Table),
            "markdowns": collect(Markdown),
            "inputs": collect(Input),
        }
