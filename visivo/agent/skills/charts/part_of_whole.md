---
name: part_of_whole
summary: Share of one whole across a few slices; a bar is better whenever slices must be compared.
family: part_of_whole
---

# Part of whole charts

Read this after `recommend_charts` names the family and before `write_insight`. Generated from the trace rules; do not edit by hand.

<!-- rules:start -->
**Traces**
- `pie` (preferred): Share of one whole across a few slices; a bar is better whenever slices must be compared.
- `funnelarea` (niche): A pie drawn as a funnel shape; slice height is share of the total. Presentation-only; use funnel for drop-off.

**Use when**
- A genuine part-of-whole (`semantics.part_of_whole`): one additive metric over one categorical whose values are exhaustive.
- A few slices, one of them dominant; the message is 'most of it is X'.
- `intent: composition` and the reader wants the share, not the rank.
- A pie-shaped question (a few parts of one additive whole) whose parts have a natural order, and someone explicitly asked for a funnel look.
- Disjoint, exhaustive stages (each rider sits in exactly one lifecycle stage) where `percent` of the total is meaningful.

**Avoid when**
- Too many slices to tell apart; collapse to a top-N + Other, or use a bar sorted by share.
- Slices of similar size; a pie cannot show that 23% differs from 26%, a bar can.
- A non-additive metric; an average fare per payment type is not a share of anything.
- Comparing composition across groups; use one stacked bar per group instead of several pies.
- Nested conversion stages (visited, then signed up, then paid); `percent` is of the sum of stages, not of the first, so use funnel with `percent initial`.
- Too many stages to tell apart; collapse to a top-N + Other as for pie, or use a bar.
- Stages that must be compared precisely; the outline is a fixed trapezoid, so only slice heights carry data. Use funnel or bar.
- An unordered categorical; a funnel silhouette implies a sequence, so use pie or bar.

**Data shape:** 1 metric; 1 dimension; 2–5 values on the main dimension (categorical, boolean, geo_region).

**Limits:** 4 series ideal, 5 at most; over the limit, repair with `top_n_other`, `bar`.

**Gotchas**
- `values` should be an aggregate over `labels` so the query returns one row per slice; Plotly sums rows that share a label, but only after every raw row has been shipped.
- Plotly sorts slices by value and starts at 12 o'clock; set `sort: false` and a `sort` interaction to control the order.
- The theme colours slices in row order, not by category; to give a category a fixed colour, pin it with `marker.colors: ?{ CASE <col> WHEN ... END }`.
- A `split` draws one pie per value on top of each other in the same circle; a split pie is a stacked bar.
- Nulls become a slice labelled 'null'; filter or coalesce them in SQL.
- There is no `sort` prop: stages draw in row order, top to bottom, so the insight needs a `sort` interaction on a stage-order column, never on the value.
- `textinfo` accepts only label/text/value/percent; `percent` is share of the summed stages. There is no `percent initial` or `percent previous` (those belong to funnel).
- `values` should be one aggregate per stage; Plotly sums rows that share a label, but only after every raw row has been shipped.
- `marker.colors` replaces the theme colours; set it from a CASE on the stage only to match colours used elsewhere.
- Nulls become a 'null' stage; coalesce or filter in SQL.

**Variations**
- When more categories than a pie can show: `top_n_other` in SQL down to the slice limit; never draw past it.
- When the total should show alongside the shares: a donut (`hole: 0.4`) with the total in the hole via `layout.annotations`.
- When the same composition is wanted for several groups: one stacked bar per group instead of several pies.

**Other uses**
- Progress ring, one share of a target (quota attained, budget spent). Two rows, achieved and remaining, as `labels`/`values`; `hole: 0.7`, `sort: false`, `direction: clockwise`, `textinfo: percent`, and the KPI name in `title` with `title.position: middle center`.
- Call out one slice, e.g. the segment the dashboard is about. `pull: ?{ case when <label> = '<value>' then 0.1 else 0 end }` pulls that slice out of the pie.

**Placement:** `medium` height, 4 of 12 columns, as a `breakdown`; pair with `indicator_overlay`, `chart_beside(bar)`.
**Mobile:** One-third width is fine until the stack; then it takes a full row, so keep the labels on the slices (`textinfo`) and drop the legend.

**Example** (`pie`)

```yaml
insights:
  - name: rides-by-payment-type
    props:
      type: pie
      labels: ?{ ${ref(trips).payment_type} }
      values: ?{ count(*) }
      hole: 0.4
      textinfo: label+percent
      sort: false
    interactions:
      - sort: ?{ count(*) DESC }
```
<!-- rules:end -->
