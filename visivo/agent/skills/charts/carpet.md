---
name: carpet
summary: The a/b parameter grid that contourcarpet and scattercarpet draw on; alone it is only a warped mesh.
family: carpet
---

# Carpet charts

Read this after `recommend_charts` names the family and before `write_insight`. Generated from the trace rules; do not edit by hand.

<!-- rules:start -->
**Traces**
- `carpet` (niche): The a/b parameter grid that contourcarpet and scattercarpet draw on; alone it is only a warped mesh.
- `contourcarpet` (niche): Contours of a third metric drawn on a carpet's warped a/b grid; needs a carpet insight in the same chart.
- `scattercarpet` (niche): Points or lines placed by (a, b) on a carpet's warped grid; needs a carpet insight in the same chart.

**Use when**
- Only as the base layer of a `contourcarpet` or `scattercarpet` in the same chart, sharing a `carpet` id.
- A what-if grid: two input levers (base fare × per-mile rate) mapped to two outputs (avg fare, trips) per node.
- A what-if surface where the two levers do not map to straight axes: `z` (revenue) over base fare × per-mile, placed at (avg fare, trips).
- Reading iso-lines of an outcome across a tradeoff space is the point, not exact cell values.
- Locating observed entities on a what-if grid: each company's actual base fare × per-mile rate on the scenario carpet.
- A path through the lever space over time (pricing changes by quarter) with `mode: lines+markers`.

**Avoid when**
- On its own as the answer to a question; the mesh carries no metric a reader can compare, so use a heatmap or contour.
- The two dimensions are independent axes (hour × weekday); a plain heatmap is the same picture, undistorted.
- Too few levels on either parameter to form a grid, or so many that the mesh becomes an unreadable hatch.
- Categorical or time parameters; `a` and `b` must be numeric and form a (near-)complete grid.
- The two dimensions plot fine on plain x/y; use a contour or heatmap, since the warp only adds reading cost.
- Any categorical or time dimension, or a sparse grid; contours interpolate across gaps that are not data.
- An audience that has not seen a carpet plot; a heatmap plus a table answers the same question.
- There is no carpet worth drawing; a plain `scatter` of the two levers says the same thing without the warp.
- Points outside the carpet's a/b range; Plotly hides them silently.
- Too many points; the grid already fills the plot, so aggregate or switch to scatter.

**Data shape:** 1–2 metrics; 2 dimensions; 3–20 values on the main dimension (numeric_discrete, numeric_continuous).

**Limits:** 1 series ideal, 1 at most; over the limit, repair with `heatmap`, `input_filter`, `regrain`.

**Gotchas**
- One row per (a, b) node; Visivo sends long rows and Plotly pivots them, but missing nodes are smooth-filled silently with invented values.
- Set a literal `carpet: <id>` string on the carpet and every dependent; `${ref(insight)}` is passed through as text, not resolved.
- Never `split` a carpet: each value becomes another carpet with the same id, and dependents bind to the first one.
- `aaxis` and `baxis` titles label the grid; `layout.xaxis` and `layout.yaxis` titles label the outputs. Set both or the chart is unreadable.
- A `filter` interaction drops grid nodes and the smoothing fills the hole; filter the dependents, not the carpet.
- Both insights go in one chart's `insights`; the contourcarpet has no axes of its own and draws nothing without the carpet.
- Bind `a` and `b` on the contourcarpet too; without them `z` is matched to the carpet's rows by position, and two queries need not return the same order.
- Use a literal `carpet: <id>` on both; `${ref(carpet-insight)}` reaches Plotly as text and only works through the first-carpet fallback.
- Never `split`; one contourcarpet per carpet. Set a theme-neutral `colorscale` (Viridis), and `zmid` only for a diverging measure.
- `z` must be one value per (a, b) node from a GROUP BY over both levers; duplicates collapse to the last row.
- Put the carpet insight in the same chart with the same literal `carpet: <id>`; alone it renders nothing, and `${ref()}` is not resolved.
- `a` and `b` must be in the carpet's units and range; values outside the grid are dropped with no warning.
- `split` is safe here (one series per value), unlike on the carpet itself.
- For `mode: lines`, add `- sort:` on the path order or the line zig-zags in storage order.
- Per-row hex colors in `marker.color` opt out of the theme; use `split` instead.

**Variations**
- When a third output per node: a `contourcarpet` on the same `carpet` id, with the output as `z`.
- When observed points belong on the grid, such as each company's actual pricing: a `scattercarpet` on the same id, `split` by company.
- When the grid has only one output per node: omit `x` for a cheater plot (`y` against a skewed index, tuned by `cheaterslope`) and hide the meaningless x axis.

**Placement:** `large` height, 12 of 12 columns, as a `relationship`; pair with `carpet_overlay(contourcarpet)`, `carpet_overlay(scattercarpet)`, `detail_table_below`.
**Mobile:** The mesh labels collide below 1024 px; use fewer levels per parameter than on desktop and drop the minor grid lines.

**Example** (`carpet`)

```yaml
insights:
  - name: fare-grid
    props:
      type: carpet
      carpet: fare-grid
      a: ?{ ${ref(fare_scenarios).base_fare} }
      b: ?{ ${ref(fare_scenarios).per_mile} }
      x: ?{ ${ref(fare_scenarios).avg_fare} }
      y: ?{ ${ref(fare_scenarios).trips} }
      aaxis: {title: {text: Base fare}, tickprefix: "$"}
      baxis: {title: {text: Per mile}, tickprefix: "$"}
```
<!-- rules:end -->
