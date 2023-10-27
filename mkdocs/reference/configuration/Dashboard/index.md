Dashboards are grids where you are able to organize and present `charts`, `tables` and `markdown`.

The grid is build from `Rows` that can house 1 to n `Items`. `Items` wrap around your charts, tables or markdown and allow you to control the width of your columns within the Row. Here's an example of a dashboard configuration:
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
          - width: 1
            markdown: "# Some inline **markdown**"
          - width: 1
            chart: ref(another-chart)
          - width: 2
            chart: ref(a-third-chart)
```
## Attributes
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| name | string | None | The unique name of the object across the entire project. |
| rows | Array of [Row](https://docs.visivo.io/reference/configuration/Dashboard/Row/) | [] | A list of `Row` objects |
