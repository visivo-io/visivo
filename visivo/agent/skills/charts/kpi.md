---
name: kpi
summary: One number, optionally with a delta against a reference or a gauge against a target.
family: kpi
---

# Kpi charts

Read this after `recommend_charts` names the family and before `write_insight`. Generated from the trace rules; do not edit by hand.

<!-- rules:start -->
**Traces**
- `indicator` (preferred): One number, optionally with a delta against a reference or a gauge against a target.

**Use when**
- A single aggregate the dashboard is about (total rides, revenue, average fare); several of them make a KPI strip.
- The same aggregate for the current and previous period: `mode: number+delta`.
- Progress against a fixed target or bound: `mode: gauge+number`.

**Avoid when**
- More than one row would be interesting; the indicator shows `[0]` only, so use a bar or table.
- The number has no context (no unit, no comparison, no target); pair it with a delta or a sparkline.
- More KPIs than fit one row; split them into a 2×2 cluster or drop the weakest.

**Data shape:** 1 metric; 0–1 dimensions (time).

**Limits:** 1 series ideal, 1 at most.

**Gotchas**
- `value` must be a single cell: `?{ sum(x) }[0]`. Without `[0]` the whole column is passed and nothing renders.
- A delta needs two rows in a known order: group by period and `sort` DESC so `[0]` is current and `[1]` previous.
- Units go in `number.prefix`/`number.suffix`; keep the value a plain aggregate so `number.valueformat` can format it.
- A `split` draws one indicator per value in the same `domain`, stacked on top of each other; a split KPI is a bar chart.
- A gauge (`mode` containing `gauge`) keeps a chart's full margins and is unreadable in an `xsmall` KPI row; tell `recommend_layout` with `hints.gauge: true` and it gets a taller row.

**Variations**
- When the KPI is compared with the previous period: aggregate by period, `sort` DESC, `value: ?{ <metric> }[0]` and `delta.reference: ?{ <metric> }[1]`; with `delta.relative: true`, set `delta.valueformat: '.1%'` or the ratio prints unrounded.
- When there is a target or bound to measure progress against: `mode: gauge+number` with `gauge.axis.range` and `gauge.threshold.value`.
- When several KPIs share one chart: the `indicator_overlay` pairing with a `domain` per insight so they sit side by side, or one chart per KPI in a `kpi` row.

**Other uses**
- Bullet chart, a horizontal bar against a target with qualitative bands. `mode: number+gauge+delta`, `gauge.shape: bullet`, `gauge.threshold.value` for the target and `gauge.steps` (each with `range`) for the bands.

**Placement:** `xsmall` height, 3 of 12 columns, as a `kpi`; pair with `indicator_overlay`, `kpi_strip_above`, `kpi_cluster_beside`.
**Mobile:** KPIs stack one per line; order them by importance and keep only the strongest.

**Example** (`indicator`)

```yaml
insights:
  - name: total-rides
    props:
      type: indicator
      mode: number+delta
      value: ?{ count(*) }[0]
      delta:
        reference: ?{ count(*) }[1]
        relative: true
      number:
        suffix: " rides"
    interactions:
      - sort: ?{ date_trunc('month', ${ref(trips).pickup_at}) DESC }
```
<!-- rules:end -->
