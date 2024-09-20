from .base.named_model import NamedModel
from .base.parent_model import ParentModel
from pydantic import Field
from .row import Row
from .trace import Trace
from .chart import Chart
from .table import Table
from typing import List


class Dashboard(NamedModel, ParentModel):
    """
    Dashboards are lists of [rows](./Row/) that enable you to build your dashboard grid. 

    !!! tip 
        
        By leveraging [`visivo serve`](../../cli/#serve) while building you can quickly optimize your layout. Simply re-size your row heights and item widths, save the file and quickly see the new layout of your dashboard on localhost:8000. 
    
    Within the [rows](./Row/) you are able to organize and display `charts`, `tables`, `selectors` and `markdown` from your project as [items](./Row/Item/).

    <div class="grid" markdown>

    ![](../../../assets/dashboard_layout.png)

    !!! note
    
        ``` yaml title="visivo.project.yml"
        dashboards:
          - name: Layout Example
            rows:
              - height: medium
                items: #item.width default is 1
                  - chart: ...
                  - chart: ...
                  - chart: ...
              - height: large 
                items: 
                  - width: 2 
                    table: ...
                  - width: 1
                    markdown: ...
              - height: small 
                items: 
                  - width: 2 
                    selector: ...
                  - chart: ...
                  - chart: ...
                  - width: 2
                    chart: ...         
        ```

    </div>

    Above you can see how changing the row heights and item widths impacts the layout of the dashboard.
    
    !!! example

        `row.height` defaults to `medium` and `item.width` defaults to `1`. Specifying those fields are optional if you want to use the default values
        ``` yaml
        dashboards:
          - name: any-name-you-want  #unique name of your dashboard
            rows:
              - height: medium
                items:
                  - width: 2  #widths are evaluated relative to other items in the row
                    table: ref(a-table-name)
                  - width 1  #this chart will be 1/3 of the row
                    chart: ref(a-chart-name)
              - height: small
                items:
                  - markdown: "# Some inline **markdown**"
                  - chart: ref(another-chart)
                  - width: 2
                    chart: ref(a-third-chart)
        ```
    """

    def child_items(self):
        return self.rows

    rows: List[Row] = Field([], description="A list of `Row` objects")

    @property
    def all_traces(self):
        traces = []
        for chart in self.chart_objs:
            traces += chart.traces
        for table in self.table_objs:
            traces += table.traces

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
