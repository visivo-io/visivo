from ..models.project import Project
from ..models.base_model import BaseModel


class Serializer:
    def __init__(self, project: Project):
        self.project = project

    def dereference(self) -> Project:
        project = self.project.copy(deep=True)
        for dashboard in project.dashboards:

            def replace_chart_ref(item):
                if item.chart and BaseModel.is_ref(obj=item.chart):
                    name = BaseModel.get_name(obj=item.chart)
                    item.chart = self.project.find_chart(name=name)

            def replace_trace_ref(chart):
                traces = []
                for trace in chart.traces:
                    if BaseModel.is_ref(obj=trace):
                        name = BaseModel.get_name(obj=trace)
                        traces.append(self.project.find_trace(name=name))
                    else:
                        traces.append(trace)
                chart.traces = traces

            dashboard.for_each_item(replace_chart_ref)

            dashboard.for_each_chart(replace_trace_ref)

        project.charts = []
        project.traces = []
        return project
