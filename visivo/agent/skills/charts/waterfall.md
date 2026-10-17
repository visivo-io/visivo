---
name: waterfall
summary: Signed contributions that bridge a start total to an end total; the chart for 'what changed and why'.
family: waterfall
---

# Waterfall charts

Read this after `recommend_charts` names the family and before `write_insight`. Generated from the trace rules; do not edit by hand.

<!-- rules:start -->
**Traces**
- `waterfall` (preferred): Signed contributions that bridge a start total to an end total; the chart for 'what changed and why'.

**Use when**
- `semantics.signed_contributions`: positive and negative parts that sum from one total to another (revenue bridge, budget variance, month-over-month change by driver).
- A handful of contributions with an explicit start and/or end total.
- `intent: change` where the parts explain the delta rather than the level.

**Avoid when**
- All contributions have the same sign; a stacked bar or a sorted bar says the same thing more simply.
- The parts do not sum to the totals (averages, rates); the bridge will not close.
- A time series of levels; that is a line, and a waterfall of monthly totals is not a bridge.
- Too many steps to label; collapse the small ones into Other.

**Data shape:** 1 metric; 1–2 dimensions; 3–20 values on the main dimension (categorical, time, boolean).

**Limits:** 1 series ideal, 1 at most; over the limit, repair with `collapse_rare`.

**Gotchas**
- `measure` is a column of `relative` | `total` | `absolute` per row; omit it and every bar is relative, so the end total floats instead of dropping to the axis.
- Order is everything: sort by an explicit step_order column; alphabetical steps scramble the bridge.
- A `total` row ignores its `y` and draws the running sum; an `absolute` row resets the level to its `y`. Put the opening balance in an `absolute` or first `relative` row, never a level in a `relative` row.
- Colors come from `increasing.marker.color`, `decreasing.marker.color` and `totals.marker.color`, which Plotly defaults sensibly; set them only to match the theme's accent.

**Variations**
- When steps are grouped under a parent level (quarters within halves): `x` as a list of two queries, parent first: `x: [?{ <half> }, ?{ <quarter> }]`.
- When subtotals should appear mid-bridge: rows with `measure = 'total'` placed where the running sum should be shown.
- When the amounts should be printed on the bars: `texttemplate: '%{delta:$,.0f}'`, `textposition: outside`.
- When the step labels are long: `orientation: h` with the steps on `y` and the amounts on `x`.

**Other uses**
- Running balance by period (cash flow, net new customers), each period's net change stepping from an opening to a closing balance. One row per period with `measure` `relative`, an opening row with `measure` `absolute` and a closing row with `measure` `total`; `sort` by period.

**Placement:** `medium` height, 12 of 12 columns, as a `breakdown`; pair with `kpi_strip_above`, `detail_table_below`.
**Mobile:** Full width, with fewer steps than on desktop or the labels rotate and overlap.

**Example** (`waterfall`)

```yaml
insights:
  - name: revenue-bridge
    props:
      type: waterfall
      x: ?{ ${ref(bridge).step} }
      y: ?{ ${ref(bridge).amount} }
      measure: ?{ ${ref(bridge).measure} }
      connector: {line: {width: 1}}
    interactions:
      - sort: ?{ ${ref(bridge).step_order} ASC }
```
<!-- rules:end -->
