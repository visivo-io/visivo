---
name: bar
summary: Compare a metric across categories; stacked or grouped for a second small dimension.
family: bar
---

# Bar charts

Read this after `recommend_charts` names the family and before `write_insight`. Generated from the trace rules; do not edit by hand.

<!-- rules:start -->
**Traces**
- `bar` (preferred): Compare a metric across categories; stacked or grouped for a second small dimension.

**Use when**
- One categorical, boolean or discrete-numeric dimension, compared across one or a few metrics.
- Ranking (`intent: rank`): sort by the metric and the bar order carries the message.
- Time as discrete totals (months, quarters) rather than a continuous trend.
- A second dimension of 2–7 values, stacked when the parts make a whole and grouped when they are compared.

**Avoid when**
- Too many categories to label; use a table or a top-N + Other. Labels overlap first, then the bars vanish.
- A long run of time periods; a line reads the trend, columns become a comb.
- An identifier-level dimension (zone_id, customer_id); that is a lookup, use a table.
- Too many bars in total (metrics × categories); grouped bars thin into a comb, so drop metrics or categories, or use a table.

**Data shape:** 1–10 metrics; 1–2 dimensions; 2–20 values on the main dimension; 0–24 points on the axis; 0–50 cells (categorical, boolean, geo_region, numeric_discrete, time).

**Limits:** 8 series ideal, 10 at most; over the limit, repair with `top_n_other`, `regrain`, `input_filter`.

**Gotchas**
- A bar with no `sort` is in storage order; rank charts need `- sort: ?{ <metric> DESC }`.
- `barmode` lives on the chart `layout`, not the insight; a split bar without it defaults to grouped.
- A split on a column of more than 7 values multiplies the bars silently; read the column's cardinality first.
- Series take colorway colours by order, not by value; to give a series a fixed colour (a brand colour, or the same one on every dashboard), pin it with `marker.color: ?{ CASE <col> WHEN 'Uber' THEN '#1f1f1f' ... END }`. A constant `marker.color` paints every series one colour.

**Variations**
- When a second dimension of 2–7 values: `split`; set chart `layout.barmode: stack` for part-of-whole, `group` otherwise.
- When long category labels: `orientation: h` with the category on `y`.
- When a second metric with another unit: the `bar_line_dual_axis` pairing: the second metric as a line on its own right-hand axis.
- When exact values wanted: `text: ?{ <metric> }` + `textposition: outside`, up to `text_labels.max_marks` bars; past it the labels turn vertical and shrink.
- When more categories than fit at half width: give the chart a full-width row, which labels about twice as many.
- When more series than the theme colorway has colours: add colours to the theme `colorway` list, or set the chart's `layout.colorway`; keep at most two very dark colours, which merge as thin lines. The named palettes are no more distinct than the default.

**Other uses**
- Gantt or timeline bars, one floating bar per task or phase. `orientation: h`, the task on `y`, `base: ?{ <start> }` and `x: ?{ <end> - <start> }`; sort by start.
- Range bars (low to high per category), e.g. a daily fare range. `base: ?{ min(<m>) }` and `y: ?{ max(<m>) - min(<m>) }`.

**Placement:** `medium` height, 6 of 12 columns, as a `breakdown`; pair with `bar_line_dual_axis`, `detail_table_below`, `kpi_strip_above`.
**Mobile:** Horizontal bars survive the stack better than vertical ones; show a top-N rather than every category.

**Example** (`bar`)

```yaml
insights:
  - name: rides-by-borough
    props:
      type: bar
      x: ?{ ${ref(trips).pickup_borough} }
      y: ?{ count(*) }
      text: ?{ count(*) }
    interactions:
      - split: ?{ ${ref(trips).company} }
      - sort: ?{ count(*) DESC }
```
<!-- rules:end -->
