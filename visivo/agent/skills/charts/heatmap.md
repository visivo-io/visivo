---
name: heatmap
summary: A metric over two dimensions as a colored grid; the repair for a line with too many series.
family: heatmap
---

# Heatmap charts

Read this after `recommend_charts` names the family and before `write_insight`. Generated from the trace rules; do not edit by hand.

<!-- rules:start -->
**Traces**
- `heatmap` (preferred): A metric over two dimensions as a colored grid; the repair for a line with too many series.

**Use when**
- Two dimensions with few enough cells to see each one (hour × weekday, borough × company, week × product).
- A line chart would need more series than it can separate; company × week as a grid keeps every value visible.
- Looking for a pattern (seasonality, a hot corner), not for exact magnitudes.

**Avoid when**
- Too many cells, or too many values on one axis, to label; use a pivot table or fix one dimension with an input.
- Too few values on either axis; a grouped bar is clearer.
- Exact numbers are the point; a pivot table with `format_cells` is a heatmap you can read.
- Sparse grids (most cells empty); the blanks dominate, so aggregate coarser first.

**Data shape:** 1 metric; 2 dimensions; 3–40 values on the main dimension (time, categorical, boolean, numeric_discrete, geo_region).

**Limits:** 1 series ideal, 1 at most; over the limit, repair with `regrain`, `top_n_other`, `input_filter`.

**Gotchas**
- Plotly's named Blues, Greens, Greys, YlGnBu and YlOrRd scales run dark to light, so the highest values come out palest; add `reversescale: true`, or use Reds or Viridis.
- x, y and z come from one GROUP BY over both dimensions; over raw rows, rows that share an x/y pair overwrite each other and the cell shows only the last one.
- Set `layout.xaxis.type: category`/`yaxis.type: category` when the axes are labels, or Plotly spaces them as numbers. Rows are bound by height: Plotly hides every other row label once rows are tighter than about 15 px.
- Weekday or month names sort alphabetically; sort by the number (`isodow`, `month`) and label with the name.
- A `split` interaction makes one heatmap per value, all on the same axes and overlapping; never split a heatmap.
- Pick one theme-neutral `colorscale` (Viridis, or Blues with `reversescale: true`, since Plotly's Blues runs dark to light); a diverging scale needs `zmid` at the meaningful centre.

**Variations**
- When the grid is small and the exact values matter: `texttemplate: '%{z:,.0f}'` prints each cell's value on it.
- When the metric is a rate rather than a count: compute the ratio in SQL; a heatmap of raw counts is dominated by the busiest row.
- When there are too many cells to read as a grid: a `table_pivot` with `format_cells`, or an input that fixes one dimension.

**Other uses**
- Calendar heatmap, one cell per day laid out as weeks × weekdays. `x: ?{ date_trunc('week', <date>) }`, `y: ?{ isodow(<date>) }`, `z: ?{ <metric> }`, `xgap`/`ygap` for cell borders; label `layout.yaxis` with day names.
- Cohort retention grid, signup cohort against periods since signup. `y: ?{ <cohort_month> }`, `x: ?{ <months_since_signup> }`, `z: ?{ <retained_share> }` computed in SQL, `texttemplate: '%{z:.0%}'`, `hoverongaps: false` for the empty triangle.
- Correlation matrix between numeric columns. Unpivot the pairwise `corr()` results in SQL to x/y/z rows; `zmin: -1`, `zmax: 1`, `zmid: 0` and a diverging `colorscale` such as `RdBu`.

**Placement:** `medium` height, 12 of 12 columns, as a `breakdown`; pair with `detail_table_below`, `kpi_strip_above`.
**Mobile:** Keep the longer axis vertical; a grid with many columns becomes unreadable on narrow screens.

**Example** (`heatmap`)

```yaml
insights:
  - name: rides-by-week-and-borough
    props:
      type: heatmap
      x: ?{ date_trunc('week', ${ref(trips).pickup_at}) }
      y: ?{ ${ref(trips).pickup_borough} }
      z: ?{ count(*) }
      colorscale: Viridis
    interactions:
      - sort: ?{ date_trunc('week', ${ref(trips).pickup_at}) ASC }
charts:
  - name: rides-by-week-and-borough-chart
    insights: ["${ref(rides-by-week-and-borough)}"]
    layout: {yaxis: {categoryorder: total ascending}}
```
<!-- rules:end -->
