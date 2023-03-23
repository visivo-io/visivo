from .base_model import BaseModel
from .row import Row
from .trace import Trace
from .chart import Chart
from typing import List


class Dashboard(BaseModel):
    rows: List[Row] = []

    @property
    def all_traces(self):
        traces = []
        for chart in self.chart_objs:
            traces += chart.traces
        return traces

    @property
    def all_charts(self):
        charts = []

        def append_chart(chart):
            charts.append(chart)

        self.for_each_chart(append_chart)
        return charts

    def for_each_item(self, function):
        for row in self.rows:
            for item in row.items:
                function(item)

    def for_each_chart(self, function):
        def chart_check(item):
            if item.chart:
                function(item.chart)

        self.for_each_item(chart_check)

    @property
    def trace_objs(self) -> List[Trace]:
        return list(filter(Trace.is_obj, self.all_traces))

    @property
    def trace_refs(self) -> List[str]:
        return list(filter(Trace.is_ref, self.all_traces))

    @property
    def chart_objs(self) -> List[Chart]:
        return list(filter(Chart.is_obj, self.all_charts))

    @property
    def chart_refs(self) -> List[str]:
        return list(filter(Chart.is_ref, self.all_charts))

    def find_trace(self, name: str):
        for row in self.rows:
            for item in row.items:
                if item.chart:
                    trace = item.chart.find_trace(name)
                    if trace:
                        return trace
