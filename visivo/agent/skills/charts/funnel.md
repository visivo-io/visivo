---
name: funnel
summary: Ordered stages shrinking from first to last; shows drop-off, not a distribution.
family: funnel
---

# Funnel charts

Read this after `recommend_charts` names the family and before `write_insight`. Generated from the trace rules; do not edit by hand.

<!-- rules:start -->
**Traces**
- `funnel` (preferred): Ordered stages shrinking from first to last; shows drop-off, not a distribution.

**Use when**
- `semantics.ordered_stages`: a categorical whose values are a sequence everyone passes through in order (visited → signed up → paid).
- A handful of stages and a count or amount per stage that is monotonically non-increasing.
- `intent: change` or `flow` without branching; percent of previous stage is the message.

**Avoid when**
- The categories are not sequential stages (payment types, boroughs); that is a sorted bar, and a funnel implies a drop-off that is not there.
- Values are not monotonic (stage 3 > stage 2); the shape lies, so use a bar.
- Branching flows; use a sankey.
- Too many stages to read as one drop-off; collapse them or split into two funnels.

**Data shape:** 1 metric; 1–2 dimensions; 3–10 values on the main dimension (categorical, boolean).

**Limits:** 2 series ideal, 4 at most; over the limit, repair with `top_n_other`, `input_filter`.

**Gotchas**
- Stages must be sorted by their **order**, not their value: sort by a stage_order column (`min(stage_order)` when grouped), never by the count.
- Without a `sort` interaction the stages arrive in whatever order the query returns them; a CASE or lookup column for the order is required.
- `x` is the value and `y` the stage (horizontal is the default); `orientation: v` swaps them.
- A constant `marker.color` drops the theme colorway; leave it unset.
- `count(distinct user)` per stage, not `count(*)`; repeat events inflate later stages and break monotonicity.

**Variations**
- When a categorical of 2–7 values (a segment) should be compared: `split` with `layout.funnelmode: group`; the counts stay comparable per stage.
- When the message is percent of the first stage: `textinfo: value+percent initial`.
- When the stages hold amounts rather than counts: the same props; say the unit in the axis title.

**Placement:** `medium` height, 6 of 12 columns, as a `breakdown`; pair with `kpi_strip_above`, `detail_table_below`.
**Mobile:** Half width survives the stack as a full row; keep labels short.

**Example** (`funnel`)

```yaml
insights:
  - name: booking-funnel
    props:
      type: funnel
      y: ?{ ${ref(events).stage} }
      x: ?{ count(distinct ${ref(events).user_id}) }
      textinfo: value+percent previous
    interactions:
      - sort: ?{ min(${ref(events).stage_order}) ASC }
```
<!-- rules:end -->
