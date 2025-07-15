from visivo.models.dashboards.base_dashboard import BaseDashboard
from visivo.models.base.parent_model import ParentModel
from pydantic import Field
from visivo.models.row import Row
from typing import List, Literal


class Dashboard(BaseDashboard, ParentModel):
    """
    Dashboards are lists of [rows](./Row/) that enable you to build your dashboard grid.

    !!! tip

        By leveraging [`visivo serve`](./../../../cli/#serve) while building you can quickly optimize your layout. Simply re-size your row heights and item widths, save the file and quickly see the new layout of your dashboard on localhost:8000.

    Within the [rows](./Row/) you are able to organize and display `charts`, `tables`, `selectors` and `markdown` from your project as [items](./Row/Item/).

    <div class="grid" markdown>

    ![](../../../../assets/dashboard_layout.png)

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

    type: Literal["internal"] = Field(
        "internal", description="The type of dashboard (always 'internal')"
    )

    def for_each_item(self, function):
        for row in self.rows:
            for item in row.items:
                function(item)
