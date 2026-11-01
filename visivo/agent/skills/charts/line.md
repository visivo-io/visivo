---
name: line
summary: One trace type, three idioms — a line over an ordered axis, a filled area, or x/y markers.
family: line
---

# Line charts

Read this after `recommend_charts` names the family and before `write_insight`. Generated from the trace rules; do not edit by hand.

<!-- rules:start -->
**Traces**
- `scatter` (preferred): One trace type, three idioms — a line over an ordered axis, a filled area, or x/y markers.
- `scattergl` (preferred): WebGL scatter; the repair target when a scatter has too many points for SVG.

**Use when**
- A metric over time or any ordered axis (days since signup, step, rank): `mode: lines`.
- A few series share the axis: split on the categorical.
- Two numeric measures per entity, to see a relationship: `mode: markers`.
- Stacked composition over time when the parts are additive: `fill` + `stackgroup`.
- Any `scatter` case (line or markers) with too many points for SVG, even after aggregation.
- Dense x/y clouds (fare vs distance over every trip) where seeing the shape matters more than hovering a point.

**Avoid when**
- The axis is an unordered categorical; the line implies a sequence that is not there, use bar.
- Too many series to tell apart; repair with top-N + Other, an input filter, or a heatmap.
- Too many points for SVG to stay responsive; use scattergl, or aggregate in SQL first.
- A stacked area of non-additive measures (rates, averages); stacking sums them, which is meaningless.
- Few enough points for plain `scatter`, which renders crisper text and supports every prop.
- Stacked areas; scattergl has no `stackgroup`, so aggregate and use `scatter`.
- Dashboards with many charts; each WebGL context costs memory and browsers cap them at ~8–16.
- Printing or export; WebGL canvases rasterize.

**Data shape:** 1–3 metrics; 1–2 dimensions; 3+ points on the axis; 0–10000 rows (time, numeric_continuous, numeric_discrete, categorical, boolean).

**Limits:** 8 series ideal, 12 at most; over the limit, repair with `top_n_other`, `input_filter`, `small_multiples`, `heatmap`.

**Gotchas**
- Always add `- sort: ?{ <x expression> ASC }`; without it the line connects points in storage order and zig-zags.
- `x` and `y` must be aggregated at the same grain: `date_trunc('day', ts)` with `count(*)`, never raw rows for a line.
- To give a series a fixed colour (a brand colour, or the same one on every dashboard), pin it with a CASE on the split column: `marker.color: ?{ CASE ... END }` for markers, `line.color: "?{ CASE ... END }[0]"` for lines. Without the `[0]` the line colour is silently ignored.
- A `split` adds a series per distinct value: check the column's cardinality first (up to 7 values is fine, 8–20 needs top-N).
- `fill: tonexty` fills to the previous insight in the chart, so insight order in `charts.insights` is the stacking order; prefer `stackgroup` for stacked areas.
- Still ship a bounded result: the browser receives every row, so sample or clip in SQL on large tables.
- Set `marker.opacity` well below 1 (0.2–0.4) or a dense cloud is a solid blob.
- Hover is coarser than scatter; put the exact figures in a table beside it when they matter.
- With `mode: lines`, add `- sort: ?{ <x expression> ASC }`; without it the line connects points in storage order and zig-zags.

**Variations**
- When a second categorical dimension of 2–7 values: `split` interaction; one line per value on shared axes.
- When a second metric with a different unit: the `bar_line_dual_axis` pairing: the second metric on its own right-hand axis.
- When a third numeric measure per point in markers mode: `marker.size` (it scales area, not radius); never `marker.color` unless it encodes data.
- When split markers rather than lines: keep fewer series than for lines; overlapping clouds mix colours in the dense core.
- When more series than the theme colorway has colours: add colours to the theme `colorway` list, or set the chart's `layout.colorway`; keep at most two very dark colours, which merge as thin lines. The named palettes are no more distinct than the default.
- When too many series for one legend: a heatmap (series × axis) keeps every value readable.

**Other uses**
- Error bars, e.g. an average with its spread per group or period. `mode: markers`, `y: ?{ avg(<m>) }` and `error_y: {type: data, array: ?{ stddev(<m>) }}`.
- A confidence or forecast band around a line. A lower-bound insight with `line.width: 0`, then an upper-bound insight with `fill: tonexty` and `line.width: 0`, then the line itself; order them so in `charts.insights`.
- A step line for values that change at points in time (prices, plan tier, inventory). `mode: lines` with `line.shape: hv`.

**Placement:** `medium` height, 12 of 12 columns, as a `hero`; pair with `indicator_overlay`, `bar_line_dual_axis`, `detail_table_below`.
**Mobile:** Keep fewer series than on desktop and the legend horizontal; a full-width line survives the stack, a half-width one gets too short to read.

**Example** (`scatter`)

```yaml
insights:
  - name: rides-per-day
    props:
      type: scatter
      mode: lines
      x: ?{ date_trunc('day', ${ref(trips).pickup_at}) }
      y: ?{ count(*) }
    interactions:
      - split: ?{ ${ref(trips).company} }
      - sort: ?{ date_trunc('day', ${ref(trips).pickup_at}) ASC }
```
<!-- rules:end -->
