The Item houses one chart, table or markdown object. It also informs the width that the chart, table or markdown should occupy within a row. Widths are evaluated for each item in the row by summing all of the widths and then using the relative weights.

In the example below, the markdown would take up 1/4th of the row and would be positioned on the left edge. The table would also take up 1/4th of the page and would sit to the right of the markdown. The chart would take up 1/2 of the page and would touch the right edge of the row.

``` yaml
items:
  - width: 1
    markdown: "# Some inline **markdown**"
  - width: 1
    table: ref(table-name)
  - width: 2
    chart: ref(chart-name)
```
## Attributes
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| width | integer | 1 | The width of the Item determines is evaluated relative to the other items in a row. |
| markdown | string | None | Markdown text to include in the dashboard. |
| chart | [Chart](https://docs.visivo.io/reference/configuration/Chart/) | None | A chart object defined inline or a ref() to a chart. |
| table | [Table](https://docs.visivo.io/reference/configuration/Table/) | None | A Table object defined inline or a ref() to a table |
