from ..models.project import Project
from ..models.base_model import BaseModel


class Serializer:
    def __init__(self, project: Project):
        self.project = project

    def dereference(self) -> Project:
        project = self.project.copy(deep=True)
        for dashboard in project.dashboards:

            def replace_item_ref(item):
                if item.chart and BaseModel.is_ref(obj=item.chart):
                    name = BaseModel.get_name(obj=item.chart)
                    item.chart = self.project.find_chart(name=name)
                if item.table and BaseModel.is_ref(obj=item.table):
                    name = BaseModel.get_name(obj=item.table)
                    item.table = self.project.find_table(name=name)

            def replace_chart_trace_ref(chart):
                traces = []
                for trace in chart.traces:
                    if BaseModel.is_ref(obj=trace):
                        name = BaseModel.get_name(obj=trace)
                        traces.append(self.project.find_trace(name=name))
                    else:
                        traces.append(trace)
                chart.traces = traces

            def replace_table_trace_ref(table):
                if BaseModel.is_ref(obj=table.trace):
                    name = BaseModel.get_name(obj=table.trace)
                    table.trace = self.project.find_trace(name=name)

            dashboard.for_each_item(replace_item_ref)

            dashboard.for_each_chart(replace_chart_trace_ref)

            dashboard.for_each_table(replace_table_trace_ref)

        project.charts = []
        project.traces = []
        project.tables = []
        return project
