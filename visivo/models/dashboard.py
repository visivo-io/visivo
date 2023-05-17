from .base_model import BaseModel
from .row import Row
from .trace import Trace
from .chart import Chart
from .table import Table
from typing import List


class Dashboard(BaseModel):
    rows: List[Row] = []

    @property
    def all_traces(self):
        traces = []
        for chart in self.chart_objs:
            traces += chart.traces
        for table in self.table_objs:
            traces += [table.trace]

        return traces

    @property
    def all_charts(self):
        charts = []

        def append_chart(chart):
            charts.append(chart)

        self.for_each_chart(append_chart)
        return charts

    @property
    def all_tables(self):
        tables = []

        def append_table(table):
            tables.append(table)

        self.for_each_table(append_table)
        return tables

    def for_each_item(self, function):
        for row in self.rows:
            for item in row.items:
                function(item)

    def for_each_chart(self, function):
        def chart_check(item):
            if item.chart:
                function(item.chart)

        self.for_each_item(chart_check)

    def for_each_table(self, function):
        def table_check(item):
            if item.table:
                function(item.table)

        self.for_each_item(table_check)

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

    @property
    def table_objs(self) -> List[Table]:
        return list(filter(Table.is_obj, self.all_tables))

    @property
    def table_refs(self) -> List[str]:
        return list(filter(Table.is_ref, self.all_tables))

    def find_trace(self, name: str):
        for row in self.rows:
            for item in row.items:
                if item.chart:
                    trace = item.chart.find_trace(name)
                    if trace:
                        return trace
                if item.table:
                    trace = item.table.find_trace(name)
                    if trace:
                        return trace
